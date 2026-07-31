import { randomUUID } from 'node:crypto';
import {
  type Alert,
  type Contributions,
  type CreateInspectionInput,
  type CreateWorkOrderInput,
  type Equipment,
  type InspectionAlertResult,
  type InspectionRecord,
  type InspectionWorkOrderResult,
  type UpdateInspectionInput,
  type WorkOrder,
} from '@fengsui/shared';
import { AppError } from '../middleware/errors.js';
import type { DataRepository } from '../repositories/data-repository.js';
import type { OperationsService } from './operations-service.js';

interface InspectionThresholds {
  vibration: number;
  temperature: number;
  current: number;
  pressureLow: number;
  pressureHigh: number;
}

interface InspectionEvaluation {
  recommended: boolean;
  reasons: string[];
  thresholds: InspectionThresholds;
}

function inspectionThresholds(device: Equipment): InspectionThresholds {
  const vibration = /风机|减速机/u.test(device.deviceType) ? 4.5 : 4;
  const temperature = /减速机|空压机/u.test(device.deviceType) ? 80 : 75;
  const current = Math.max(device.current * 1.15, device.current + 10);
  const pressureLow = device.pressure > 0 ? device.pressure * 0.7 : 0;
  const pressureHigh = device.pressure > 0 ? device.pressure * 1.3 : 0.2;
  return { vibration, temperature, current, pressureLow, pressureHigh };
}

export function evaluateInspection(
  inspection: Pick<
    InspectionRecord,
    | 'isAbnormal'
    | 'riskLevel'
    | 'runningStatus'
    | 'vibration'
    | 'temperature'
    | 'pressure'
    | 'current'
    | 'aiRecommendManualInspection'
  >,
  device: Equipment,
): InspectionEvaluation {
  const thresholds: InspectionThresholds = inspectionThresholds(device);
  const reasons: string[] = [];
  if (inspection.isAbnormal) reasons.push('巡检员主动标记异常');
  if (inspection.riskLevel !== '正常') {
    reasons.push(`现场风险等级为${inspection.riskLevel}`);
  }
  if (inspection.vibration > thresholds.vibration) {
    reasons.push(`振动 ${inspection.vibration} mm/s 超过演示阈值 ${thresholds.vibration} mm/s`);
  }
  if (inspection.temperature > thresholds.temperature) {
    reasons.push(`温度 ${inspection.temperature}℃ 超过演示阈值 ${thresholds.temperature}℃`);
  }
  if (inspection.current > thresholds.current) {
    reasons.push(`电流 ${inspection.current} A 超过当前设备演示阈值 ${thresholds.current.toFixed(1)} A`);
  }
  if (
    inspection.runningStatus === '运行'
    && (
      inspection.pressure < thresholds.pressureLow
      || inspection.pressure > thresholds.pressureHigh
    )
  ) {
    reasons.push(
      `压力 ${inspection.pressure} MPa 超出当前设备演示范围 `
      + `${thresholds.pressureLow.toFixed(2)}—${thresholds.pressureHigh.toFixed(2)} MPa`,
    );
  }
  if (inspection.aiRecommendManualInspection) {
    reasons.push('多模态辅助研判建议人工检查');
  }
  return { recommended: reasons.length > 0, reasons, thresholds };
}

function alertRiskLevel(record: InspectionRecord): Alert['riskLevel'] {
  if (record.riskLevel === '严重') return '高风险';
  if (record.riskLevel === '预警') return '二级预警';
  if (record.riskLevel === '关注') return '关注';
  return record.alertReasons.length >= 2 ? '二级预警' : '关注';
}

function alertDeadline(riskLevel: Alert['riskLevel']): string {
  if (riskLevel === '高风险') return '立即安排';
  if (riskLevel === '二级预警') return '24小时内';
  return '72小时内';
}

export class InspectionService {
  constructor(
    private readonly repository: DataRepository,
    private readonly operations: OperationsService,
  ) {}

  list(): Promise<InspectionRecord[]> {
    return this.repository.listInspections();
  }

  async get(id: string): Promise<InspectionRecord> {
    const record: InspectionRecord | undefined = await this.repository.getInspection(id);
    if (!record) throw new AppError(404, 'INSPECTION_NOT_FOUND', '未找到巡检记录');
    return record;
  }

  async create(input: CreateInspectionInput): Promise<InspectionRecord> {
    const existing: InspectionRecord | undefined = (await this.repository.listInspections())
      .find((item: InspectionRecord) => item.idempotencyKey === input.idempotencyKey);
    if (existing) return existing;
    const device: Equipment | undefined = await this.repository.getEquipment(input.deviceId);
    if (!device) throw new AppError(404, 'DEVICE_NOT_FOUND', '未找到设备');
    const timestamp: string = input.inspectionTime ?? new Date().toISOString();
    const base: InspectionRecord = {
      inspectionId: `INS-${timestamp.slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`,
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      inspectorName: input.inspectorName,
      inspectorUserId: input.inspectorUserId,
      inspectionTime: timestamp,
      runningStatus: input.runningStatus,
      vibration: input.vibration,
      temperature: input.temperature,
      pressure: input.pressure,
      current: input.current,
      abnormalDescription: input.abnormalDescription,
      imageUrls: input.imageUrls,
      riskLevel: input.riskLevel,
      aiSummary: input.aiSummary,
      aiRecommendManualInspection: input.aiRecommendManualInspection,
      isAbnormal: input.isAbnormal,
      alertRecommended: false,
      alertReasons: [],
      status: input.status,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: input.source,
      idempotencyKey: input.idempotencyKey,
      saveMode: 'local_repository',
      syncStatus: 'local_only',
      syncMessage: '巡检记录已保存到现有服务端 Repository',
    };
    const evaluation: InspectionEvaluation = evaluateInspection(base, device);
    const record: InspectionRecord = {
      ...base,
      alertRecommended: evaluation.recommended,
      alertReasons: evaluation.reasons,
    };
    const created: InspectionRecord = await this.repository.createInspection(record);
    await this.log(
      created.inspectionId,
      '提交巡检记录',
      created.inspectorName,
      `${created.deviceName}；保存模式 ${created.saveMode}`,
    );
    return created;
  }

  async update(id: string, input: UpdateInspectionInput): Promise<InspectionRecord> {
    const current: InspectionRecord = await this.get(id);
    const device: Equipment | undefined = await this.repository.getEquipment(current.deviceId);
    if (!device) throw new AppError(404, 'DEVICE_NOT_FOUND', '未找到设备');
    const next: InspectionRecord = {
      ...current,
      ...(input.runningStatus ? { runningStatus: input.runningStatus } : {}),
      ...(input.vibration !== undefined ? { vibration: input.vibration } : {}),
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      ...(input.pressure !== undefined ? { pressure: input.pressure } : {}),
      ...(input.current !== undefined ? { current: input.current } : {}),
      ...(input.abnormalDescription !== undefined
        ? { abnormalDescription: input.abnormalDescription }
        : {}),
      ...(input.imageUrls ? { imageUrls: input.imageUrls } : {}),
      ...(input.riskLevel ? { riskLevel: input.riskLevel } : {}),
      ...(input.aiSummary !== undefined ? { aiSummary: input.aiSummary } : {}),
      ...(input.aiRecommendManualInspection !== undefined
        ? { aiRecommendManualInspection: input.aiRecommendManualInspection }
        : {}),
      ...(input.isAbnormal !== undefined ? { isAbnormal: input.isAbnormal } : {}),
      ...(input.status ? { status: input.status } : {}),
      updatedAt: new Date().toISOString(),
    };
    const evaluation: InspectionEvaluation = evaluateInspection(next, device);
    return this.repository.updateInspection(id, {
      ...next,
      alertRecommended: evaluation.recommended,
      alertReasons: evaluation.reasons,
    });
  }

  async createAlert(
    id: string,
    input: { operator: string; idempotencyKey: string },
  ): Promise<InspectionAlertResult> {
    const inspection: InspectionRecord = await this.get(id);
    if (inspection.alertId) {
      const existing: Alert | undefined = await this.repository.getAlert(inspection.alertId);
      if (existing) return { inspection, alert: existing, created: false };
    }
    if (!inspection.alertRecommended) {
      throw new AppError(409, 'INSPECTION_ALERT_NOT_RECOMMENDED', '当前巡检未满足生成预警条件');
    }
    const device: Equipment | undefined = await this.repository.getEquipment(inspection.deviceId);
    if (!device) throw new AppError(404, 'DEVICE_NOT_FOUND', '未找到设备');
    const evaluation: InspectionEvaluation = evaluateInspection(inspection, device);
    const contributions: Contributions = {
      vibration: Math.max(0, inspection.vibration - evaluation.thresholds.vibration),
      temperature: Math.max(0, inspection.temperature - evaluation.thresholds.temperature),
      current: Math.max(0, inspection.current - evaluation.thresholds.current),
      pressure: Math.max(
        0,
        inspection.pressure - evaluation.thresholds.pressureHigh,
        evaluation.thresholds.pressureLow - inspection.pressure,
      ),
      speed: 0,
    };
    const riskLevel: Alert['riskLevel'] = alertRiskLevel(inspection);
    const alert: Alert = {
      alertId: `ALT-${inspection.inspectionId.replace(/^INS-/u, '')}`,
      deviceId: inspection.deviceId,
      deviceName: inspection.deviceName,
      alertTime: new Date().toISOString(),
      riskLevel,
      healthScore: device.healthScore,
      operatingCondition: device.operatingCondition,
      abnormalIndicators: evaluation.reasons,
      indicatorContributions: contributions,
      suspectedCause: inspection.abnormalDescription || '现场巡检发现参数或图像异常，待专业人员复核',
      aiAnalysis: inspection.aiSummary || '未提供模型结论；本预警由现场巡检规则生成',
      maintenanceSuggestion: ['复核现场参数与测点', '按设备安全规程开展人工检查'],
      suggestedDeadline: alertDeadline(riskLevel),
      alertStatus: '待确认',
      confidence: 0,
      source: '移动巡检规则（未提供模型准确率）',
      sourceInspectionId: inspection.inspectionId,
    };
    const createdAlert: Alert = await this.repository.createAlert(alert);
    const updated: InspectionRecord = await this.repository.updateInspection(id, {
      alertId: createdAlert.alertId,
      status: '已生成预警',
      updatedAt: new Date().toISOString(),
    });
    await this.log(id, '生成预警', input.operator, `关联预警 ${createdAlert.alertId}`);
    return { inspection: updated, alert: createdAlert, created: true };
  }

  async createWorkOrder(
    id: string,
    input: CreateWorkOrderInput & { operator: string },
  ): Promise<InspectionWorkOrderResult> {
    const inspection: InspectionRecord = await this.get(id);
    if (inspection.workOrderId) {
      const existing: WorkOrder | undefined = await this.repository.getWorkOrder(inspection.workOrderId);
      const alert: Alert | undefined = inspection.alertId
        ? await this.repository.getAlert(inspection.alertId)
        : undefined;
      if (existing && alert) {
        return { inspection, alert, workOrder: existing, created: false };
      }
    }
    const alertResult: InspectionAlertResult = await this.createAlert(id, {
      operator: input.operator,
      idempotencyKey: `${input.idempotencyKey}-alert`,
    });
    const order: WorkOrder = await this.operations.createWorkOrderFromAlert(
      alertResult.alert.alertId,
      { ...input, forceNotification: true },
      input.operator,
    );
    const updated: InspectionRecord = await this.repository.updateInspection(id, {
      alertId: alertResult.alert.alertId,
      workOrderId: order.workOrderNo,
      status: '已生成工单',
      updatedAt: new Date().toISOString(),
    });
    await this.log(id, '创建维修工单', input.operator, `关联工单 ${order.workOrderNo}`);
    return {
      inspection: updated,
      alert: alertResult.alert,
      workOrder: order,
      created: true,
    };
  }

  private async log(
    entityId: string,
    action: string,
    operator: string,
    detail: string,
  ): Promise<void> {
    await this.repository.addOperationLog({
      logId: `LOG-${randomUUID()}`,
      entityType: 'inspection',
      entityId,
      action,
      operator,
      detail,
      timestamp: new Date().toISOString(),
    });
  }
}
