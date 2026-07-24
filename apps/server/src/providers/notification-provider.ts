import type { AiDiagnosis, Alert, Equipment, WorkOrder } from '@fengsui/shared';
import { env } from '../config/env.js';
import { FeishuClient } from './feishu-client.js';

export interface NotificationResult {
  messageId: string;
  delivered: boolean;
  preview: Record<string, unknown>;
  error?: string;
}

export interface WorkOrderAlertContext {
  temperature?: number;
  vibration?: number;
  healthScore?: number;
  failureProbability?: number;
  suggestedDeadline?: string;
  notice?: string;
}

export interface DiagnosisWorkOrderCardContext {
  diagnosis: AiDiagnosis;
  device: Equipment;
  alert?: Alert;
}

export interface NotificationProvider {
  sendAlert(alert: Alert, recipient?: string): Promise<NotificationResult>;
  sendWorkOrderAlert(order: WorkOrder, context?: WorkOrderAlertContext, recipient?: string): Promise<NotificationResult>;
  sendCard(card: Record<string, unknown>, recipient?: string): Promise<NotificationResult>;
  sendText(text: string, recipient?: string, receiveIdType?: 'chat_id' | 'open_id'): Promise<NotificationResult>;
  updateCard(messageId: string, card: Record<string, unknown>): Promise<NotificationResult>;
  sendTest(recipient?: string): Promise<NotificationResult>;
}

function callbackButton(text: string, value: Record<string, string | number>, type: 'default' | 'primary' = 'default', disabled = false) {
  return {
    tag: 'button', text: { tag: 'plain_text', content: text }, type, disabled,
    ...(disabled
      ? { disabled_tips: { tag: 'plain_text', content: '当前状态不允许执行该操作' } }
      : { behaviors: [{ type: 'callback', value }] }),
  };
}

function linkButton(text: string, url: string) {
  return {
    tag: 'button', text: { tag: 'plain_text', content: text }, type: 'default',
    behaviors: [{ type: 'open_url', default_url: url, pc_url: url, ios_url: url, android_url: url }],
  };
}

export function buildAlertCard(alert: Alert) {
  const url = `${env.APP_BASE_URL.replace(/\/$/, '')}/alerts/${encodeURIComponent(alert.alertId)}`;
  return {
    schema: '2.0',
    config: { update_multi: true, enable_forward: true, summary: { content: `【${alert.riskLevel}】${alert.deviceName}健康度下降` } },
    header: { template: alert.riskLevel === '高风险' ? 'red' : 'orange', title: { tag: 'plain_text', content: `【${alert.riskLevel}】${alert.deviceName}健康度下降` } },
    body: { direction: 'vertical', vertical_spacing: '8px', elements: [
      { tag: 'markdown', content: `**设备：**${alert.deviceName}\n**当前工况：**${alert.operatingCondition}\n**健康度：**${alert.healthScore}\n**风险等级：**${alert.riskLevel}\n**异常指标：**${alert.abnormalIndicators.join('、')}\n**疑似原因：**${alert.suspectedCause}\n**建议时限：**${alert.suggestedDeadline}\n**数据说明：**模拟演示数据` },
      linkButton('查看详情', url),
      callbackButton('确认预警', { action: 'acknowledge', alertId: alert.alertId }, 'primary', alert.alertStatus !== '待确认'),
      callbackButton('生成工单', { action: 'create_work_order', alertId: alert.alertId }, 'default', Boolean(alert.relatedWorkOrderId) || !['待确认', '已确认'].includes(alert.alertStatus)),
    ] },
  };
}

function workOrderActionValue(order: WorkOrder, action: string) {
  return {
    action,
    workOrderId: order.id || order.workOrderNo,
    ...(order.recordId ? { recordId: order.recordId } : {}),
    expectedStatus: order.status,
    version: order.version ?? 1,
  };
}

export function buildHighRiskWorkOrderCard(order: WorkOrder, context: WorkOrderAlertContext = {}) {
  const baseUrl = env.APP_BASE_URL.replace(/\/$/, '');
  const healthScore = context.healthScore ?? order.healthScoreBefore;
  const probability = context.failureProbability === undefined ? '待现场复核' : `${context.failureProbability}%`;
  const temperature = context.temperature === undefined ? '未提供' : `${context.temperature}℃`;
  const vibration = context.vibration === undefined ? '未提供' : `${context.vibration} mm/s`;
  const suggestedDeadline = context.suggestedDeadline ?? order.deadline;
  const twinEquipment = order.deviceId === 'IDF-001' ? 'IDF-01' : order.deviceId;
  const twinFault = /联轴|对中/.test(order.faultType) ? 'coupling-misalignment'
    : /轴承|温升/.test(order.faultType) ? 'bearing-overheat'
      : 'impeller-imbalance';
  const twinUrl = `${baseUrl}/digital-twin?equipment=${encodeURIComponent(twinEquipment)}&fault=${twinFault}&model=enhanced-v1`;
  const detailUrl = `${baseUrl}/work-orders/${encodeURIComponent(order.workOrderNo)}`;
  const aiSummary = `${order.faultDescription}；${order.maintenanceSuggestion.slice(0, 2).join('；') || '建议结合现场检查进一步确认'}`;
  const handling = order.processingRecord.at(-1)?.detail ?? '尚无处理记录';
  const parts = order.requiredSpareParts.map((part) => `${part.partName}×${part.quantity}`).join('、') || '按现场检查结果确认';
  const displayStatus: Record<string, string> = {
    待接单: '待分派',
    已接单: '已接单',
    检修中: '处理中',
    待验证: '待验收',
    已完成: '已完成',
    已关闭: '已关闭',
    已取消: '已取消',
  };
  const actions: Record<string, { text: string; type?: 'primary' | 'default' }[]> = {
    待接单: [{ text: '确认接单', type: 'primary' }],
    已接单: [{ text: '开始处理', type: 'primary' }],
    检修中: [{ text: '提交验收', type: 'primary' }],
    待验证: [{ text: '验收通过', type: 'primary' }, { text: '退回处理' }],
    已完成: [{ text: '生成知识候选', type: 'primary' }, { text: '关闭工单' }],
  };
  const actionByText: Record<string, string> = {
    确认接单: 'accept_order', 开始处理: 'start_process', 提交验收: 'submit_acceptance',
    验收通过: 'approve_completion', 退回处理: 'return_processing', 关闭工单: 'close_order',
    生成知识候选: 'create_knowledge_candidate',
  };
  return {
    schema: '2.0',
    config: { update_multi: true, enable_forward: true, summary: { content: `【${order.riskLevel}工单】${order.deviceName}需要协同处置` } },
    header: {
      template: order.riskLevel === '高风险' ? 'red' : 'orange',
      title: { tag: 'plain_text', content: `【${order.riskLevel}工单】${order.deviceName}需要协同处置` },
    },
    body: { direction: 'vertical', vertical_spacing: '8px', elements: [
      { tag: 'markdown', content: `${context.notice ? `**协同提示：**${context.notice}\n` : ''}**工单编号：**${order.workOrderNo}\n**设备名称：**${order.deviceName}\n**设备编号：**${order.deviceId}\n**故障部位：**${order.faultPart}\n**故障类型：**${order.faultType}\n**风险等级：**${order.riskLevel}\n**当前状态：**${displayStatus[order.status] ?? order.status}\n**温度：**${temperature}\n**振动：**${vibration}\n**健康度：**${healthScore}\n**故障概率：**${probability}\n**辅助研判：**${aiSummary}\n**处理进展：**${handling}\n**建议时限：**${suggestedDeadline}\n**建议备件：**${parts}\n\n> 模拟监测数据与规则型辅助研判，仅供比赛演示和现场复核参考。` },
      ...(actions[order.status] ?? []).map((item) => callbackButton(item.text, workOrderActionValue(order, actionByText[item.text]!), item.type)),
      linkButton('查看3D定位', twinUrl),
      linkButton('查看工单详情', detailUrl),
    ] },
  };
}

export function buildDiagnosisWorkOrderCard({ diagnosis, device, alert }: DiagnosisWorkOrderCardContext) {
  const baseUrl = env.APP_BASE_URL.replace(/\/$/, '');
  const deviceUrl = `${baseUrl}/equipment/${encodeURIComponent(device.deviceId)}`;
  const twinUrl = `${baseUrl}/digital-twin?equipment=${encodeURIComponent(device.deviceId === 'IDF-001' ? 'IDF-01' : device.deviceId)}&fault=bearing-overheat&model=enhanced-v1`;
  const canCreateWorkOrder = Boolean(
    alert
    && !alert.relatedWorkOrderId
    && !['已关闭', '误报'].includes(alert.alertStatus)
    && device.riskLevel !== '健康',
  );
  const headerTemplate = device.riskLevel === '高风险' ? 'red'
    : device.riskLevel === '二级预警' ? 'orange'
      : device.riskLevel === '关注' ? 'blue'
        : 'green';
  const title = `【设备研判】${device.deviceName} · ${device.riskLevel}`;
  const evidence = diagnosis.trendEvidence.join('；') || '暂无显著趋势证据';
  const causes = diagnosis.suspectedCauses.join('；') || '建议结合现场检查进一步确认';
  const inspections = diagnosis.inspectionItems.join('；') || '按计划点检';

  return {
    schema: '2.0',
    config: {
      update_multi: true,
      enable_forward: true,
      summary: { content: `${device.deviceName}当前健康度 ${device.healthScore}，风险等级${device.riskLevel}` },
    },
    header: {
      template: headerTemplate,
      title: { tag: 'plain_text', content: title },
    },
    body: {
      direction: 'vertical',
      vertical_spacing: '8px',
      elements: [
        {
          tag: 'markdown',
          content: `**设备名称：**${device.deviceName}\n**设备编号：**${device.deviceId}\n**运行状态：**${device.runningStatus}\n**当前工况：**${device.operatingCondition}\n**健康度：**${device.healthScore}\n**风险等级：**${device.riskLevel}\n**振动：**${device.vibration} mm/s\n**温度：**${device.temperature}℃\n**异常指标：**${diagnosis.abnormalIndicators.join('、') || '无'}\n**趋势证据：**${evidence}\n**疑似原因：**${causes}\n**推荐检查：**${inspections}\n**建议时限：**${diagnosis.suggestedDeadline}\n**规则匹配度：**${Math.round(diagnosis.confidence * 100)}%\n\n> 本结果根据模拟监测数据和规则库生成，仅供比赛演示与现场复核参考。`,
        },
        ...(canCreateWorkOrder
          ? [callbackButton('生成维修工单', { action: 'create_work_order', alertId: alert!.alertId }, 'primary')]
          : []),
        ...(device.deviceId === 'IDF-001' ? [linkButton('查看3D定位', twinUrl)] : []),
        linkButton('查看设备详情', deviceUrl),
      ],
    },
  };
}

export function buildTextCard(title: string, content: string, template = 'blue') {
  return {
    schema: '2.0',
    config: { update_multi: true, summary: { content: title } },
    header: { template, title: { tag: 'plain_text', content: title } },
    body: { elements: [{ tag: 'markdown', content }] },
  };
}

export class MockNotificationProvider implements NotificationProvider {
  private sequence = 0;
  async sendAlert(alert: Alert, _recipient?: string) { return this.deliver(buildAlertCard(alert), 'alert'); }
  async sendWorkOrderAlert(order: WorkOrder, context?: WorkOrderAlertContext, _recipient?: string) { return this.deliver(buildHighRiskWorkOrderCard(order, context), 'work-order'); }
  async sendCard(card: Record<string, unknown>, _recipient?: string) { return this.deliver(card, 'card'); }
  async sendText(text: string, _recipient?: string, _receiveIdType: 'chat_id' | 'open_id' = 'chat_id') { return this.deliver({ msg_type: 'text', content: { text } }, 'text'); }
  async updateCard(messageId: string, card: Record<string, unknown>) { return { ...this.deliver(card, 'update'), messageId }; }
  async sendTest(_recipient?: string) {
    return this.deliver(buildTextCard('烽燧测试消息', '机器人通道测试成功（本地模拟），未向真实会话发送。'), 'test');
  }
  private deliver(preview: Record<string, unknown>, kind: string): NotificationResult {
    this.sequence += 1;
    return { messageId: `mock-${kind}-${this.sequence}`, delivered: true, preview };
  }
}

export class FeishuBotNotificationProvider implements NotificationProvider {
  constructor(private readonly client: Pick<FeishuClient, 'request'> = new FeishuClient()) {}
  async sendAlert(alert: Alert, recipient?: string) { return this.sendCard(buildAlertCard(alert), recipient); }
  async sendWorkOrderAlert(order: WorkOrder, context?: WorkOrderAlertContext, recipient?: string) { return this.sendCard(buildHighRiskWorkOrderCard(order, context), recipient); }
  async sendTest(recipient?: string) {
    return this.sendCard(buildTextCard('烽燧机器人连接测试', '连接成功。当前消息仅用于集成验证。'), recipient);
  }
  async sendCard(card: Record<string, unknown>, recipient?: string): Promise<NotificationResult> {
    const receiveId = recipient || env.FEISHU_NOTIFICATION_CHAT_ID;
    if (!receiveId) return { messageId: '', delivered: false, preview: card, error: '未配置通知会话 ID' };
    try {
      const result = await this.client.request<{ message_id: string }>('/im/v1/messages?receive_id_type=chat_id', { method: 'POST', body: JSON.stringify({ receive_id: receiveId, msg_type: 'interactive', content: JSON.stringify(card) }) });
      return { messageId: result.message_id, delivered: true, preview: card };
    } catch (error) {
      return { messageId: '', delivered: false, preview: card, error: error instanceof Error ? error.message : '发送失败' };
    }
  }
  async sendText(text: string, recipient?: string, receiveIdType: 'chat_id' | 'open_id' = 'chat_id'): Promise<NotificationResult> {
    const receiveId = recipient || env.FEISHU_NOTIFICATION_CHAT_ID;
    const preview = { msg_type: 'text', content: { text } };
    if (!receiveId) return { messageId: '', delivered: false, preview, error: '未配置消息接收 ID' };
    try {
      const result = await this.client.request<{ message_id: string }>(`/im/v1/messages?receive_id_type=${receiveIdType}`, { method: 'POST', body: JSON.stringify({ receive_id: receiveId, msg_type: 'text', content: JSON.stringify({ text }) }) });
      return { messageId: result.message_id, delivered: true, preview };
    } catch (error) {
      return { messageId: '', delivered: false, preview, error: error instanceof Error ? error.message : '发送失败' };
    }
  }
  async updateCard(messageId: string, card: Record<string, unknown>): Promise<NotificationResult> {
    try {
      await this.client.request(`/im/v1/messages/${encodeURIComponent(messageId)}`, { method: 'PATCH', body: JSON.stringify({ msg_type: 'interactive', content: JSON.stringify(card) }) });
      return { messageId, delivered: true, preview: card };
    } catch (error) {
      return { messageId, delivered: false, preview: card, error: error instanceof Error ? error.message : '更新卡片失败' };
    }
  }
}
