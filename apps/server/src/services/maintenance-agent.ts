import { randomUUID } from 'node:crypto';
import type { AgentRun, AgentStep, RagCitation, WorkOrder } from '@fengsui/shared';
import type { DataRepository } from '../repositories/data-repository.js';
import type { OperationsService } from './operations-service.js';
import type { RagRepository } from './rag-service.js';

export interface MaintenanceAgentInput {
  deviceId: string;
  alertId?: string;
  task: string;
  maxSteps: number;
  timeoutMs: number;
  confirmCreateWorkOrder: boolean;
  operator: string;
}

interface AgentContext {
  citations: RagCitation[];
  diagnosisId?: string;
  workOrder?: WorkOrder;
  riskConclusion: string;
}

export class MaintenanceAgent {
  private readonly runs = new Map<string, AgentRun>();

  constructor(
    private readonly repository: DataRepository,
    private readonly operations: OperationsService,
    private readonly rag: RagRepository,
  ) {}

  listRuns(): AgentRun[] { return [...this.runs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)); }
  getRun(id: string): AgentRun | undefined { return this.runs.get(id); }

  async run(input: MaintenanceAgentInput): Promise<AgentRun> {
    const startedAt = new Date().toISOString();
    const run: AgentRun = {
      agentRunId: `AR-${randomUUID()}`,
      task: input.task,
      deviceId: input.deviceId,
      alertId: input.alertId,
      status: 'running',
      steps: [],
      citations: [],
      riskConclusion: '正在收集设备证据。',
      startedAt,
      maxSteps: input.maxSteps,
      requiresHumanConfirmation: !input.confirmCreateWorkOrder,
    };
    this.runs.set(run.agentRunId, run);
    const context: AgentContext = { citations: [], riskConclusion: '' };
    const deadline = Date.now() + input.timeoutMs;

    const tool = async (toolName: string, inputSummary: string, action: () => Promise<string>, citationIds: string[] = []) => {
      if (run.steps.length >= input.maxSteps) return false;
      if (Date.now() >= deadline) throw new Error('AGENT_TIMEOUT');
      const step: AgentStep = { stepId: `AS-${randomUUID()}`, toolName, status: 'running', inputSummary, outputSummary: '', startedAt: new Date().toISOString(), citationIds };
      run.steps.push(step);
      try {
        step.outputSummary = await action();
        step.status = 'completed';
      } catch (error) {
        step.status = 'failed';
        step.errorCode = error instanceof Error && error.message === 'AGENT_TIMEOUT' ? 'AGENT_TIMEOUT' : 'TOOL_UNAVAILABLE';
        step.outputSummary = '工具暂不可用，Agent继续使用已获取证据安全降级。';
      } finally {
        step.completedAt = new Date().toISOString();
      }
      return true;
    };

    try {
      let equipmentName = input.deviceId;
      await tool('getEquipmentStatus', `读取设备 ${input.deviceId} 的当前状态`, async () => {
        const equipment = await this.repository.getEquipment(input.deviceId);
        if (!equipment) throw new Error('DEVICE_NOT_FOUND');
        equipmentName = equipment.deviceName;
        context.riskConclusion = `${equipment.deviceName}健康度${equipment.healthScore}，风险等级${equipment.riskLevel}，当前工况${equipment.operatingCondition}。`;
        return context.riskConclusion;
      });
      await tool('getTelemetryTrend', `读取 ${input.deviceId} 最近遥测趋势`, async () => {
        const points = await this.repository.getTelemetry(input.deviceId);
        if (points.length < 2) return '遥测点不足，保留当前状态证据。';
        const first = points[Math.max(0, points.length - 13)]!;
        const last = points.at(-1)!;
        return `最近窗口振动 ${first.vibration}→${last.vibration} mm/s，温度 ${first.temperature}→${last.temperature}℃，健康度 ${first.healthScore}→${last.healthScore}。`;
      });
      let activeAlertId = input.alertId;
      await tool('getActiveAlerts', `查询 ${input.deviceId} 的活动预警`, async () => {
        const alerts = (await this.repository.listAlerts()).filter((item) => item.deviceId === input.deviceId && !['已关闭', '误报'].includes(item.alertStatus));
        activeAlertId ??= alerts[0]?.alertId;
        return alerts.length ? `发现${alerts.length}条活动预警，当前关联${activeAlertId}。` : '未发现活动预警，不自动创建工单。';
      });
      await tool('getMaintenanceHistory', `读取 ${input.deviceId} 历史工单`, async () => {
        const orders = (await this.repository.listWorkOrders()).filter((item) => item.deviceId === input.deviceId);
        return orders.length ? `找到${orders.length}条历史/当前工单：${orders.slice(0, 3).map((item) => `${item.workOrderNo}(${item.status})`).join('、')}。` : '未找到历史工单。';
      });
      await tool('searchKnowledgeBase', `检索${equipmentName}相关故障知识`, async () => {
        const result = await this.rag.search({ query: `${equipmentName} ${input.task}`, limit: 4 });
        context.citations = result.citations;
        run.citations = result.citations;
        return result.message;
      });
      await tool('checkSparePartInventory', `检查 ${equipmentName} 相关备件`, async () => {
        const parts = await this.repository.listSpareParts();
        const related = parts.filter((item) => item.applicableEquipment.some((value) => equipmentName.includes(value) || value === '通用' || value === '旋转设备'));
        return related.length ? related.slice(0, 4).map((item) => `${item.partName}${item.currentStock}${item.unit}(${item.stockStatus})`).join('、') : '未匹配到专用备件，需人工复核。';
      });
      await tool('generateDiagnosis', `结合遥测和RAG证据研判 ${equipmentName}`, async () => {
        const diagnosis = await this.operations.diagnose(input.deviceId, `为什么判断${equipmentName}存在风险，建议检查什么？`);
        context.diagnosisId = `DG-${randomUUID()}`;
        run.diagnosisId = context.diagnosisId;
        context.riskConclusion = diagnosis.riskJudgment;
        run.riskConclusion = diagnosis.riskJudgment;
        return `${diagnosis.riskJudgment} 建议时限：${diagnosis.suggestedDeadline}。`;
      }, context.citations.map((item) => item.citationId));

      const existing = (await this.repository.listWorkOrders()).find((item) => item.deviceId === input.deviceId && !['已完成', '已取消'].includes(item.status) && (!activeAlertId || item.sourceAlertId === activeAlertId));
      await tool('createWorkOrder', activeAlertId ? `检查预警 ${activeAlertId} 是否需要创建工单` : '无活动预警，不创建工单', async () => {
        if (existing) {
          context.workOrder = existing;
          run.workOrderId = existing.workOrderNo;
          return `检测到现有工单${existing.workOrderNo}，未重复创建。`;
        }
        if (!activeAlertId) return '缺少活动预警，已跳过工单创建。';
        if (!input.confirmCreateWorkOrder) return '已完成方案准备，等待人工确认后创建工单。';
        context.workOrder = await this.operations.createWorkOrderFromAlert(activeAlertId, {
          assignee: '张工', assigneeUserId: 'zhang-gong', idempotencyKey: `agent-${activeAlertId}-${input.deviceId}`,
        }, input.operator);
        run.workOrderId = context.workOrder.workOrderNo;
        return `已通过现有业务服务创建工单${context.workOrder.workOrderNo}。`;
      });
      await tool('notifyFeishu', '确认通知链路状态', async () => context.workOrder ? '工单服务已按风险等级执行飞书通知；发送失败不会回滚工单。' : '未创建新工单，不发送通知。');
      await tool('createKnowledgeCandidate', '准备知识沉淀候选', async () => context.workOrder?.status === '已完成' ? '工单已完成，可生成知识候选。' : '工单完成并验证后再生成知识候选，当前不提前伪造维修结论。');

      run.alertId = activeAlertId;
      if (run.steps.some((step) => step.status === 'failed')) run.status = 'partial';
      else if (run.steps.length >= input.maxSteps && input.maxSteps < 10) run.status = 'partial';
      else if (!input.confirmCreateWorkOrder && activeAlertId && !existing) run.status = 'awaiting_confirmation';
      else run.status = 'completed';
    } catch {
      run.status = 'partial';
      run.riskConclusion = context.riskConclusion || 'Agent执行超时或工具异常，已保留已获取证据并停止敏感操作。';
    }
    run.completedAt = new Date().toISOString();
    this.runs.set(run.agentRunId, run);
    return run;
  }
}
