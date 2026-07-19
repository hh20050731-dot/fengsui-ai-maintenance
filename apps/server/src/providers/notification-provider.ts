import type { Alert, WorkOrder } from '@fengsui/shared';
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
}

export interface NotificationProvider {
  sendAlert(alert: Alert, recipient?: string): Promise<NotificationResult>;
  sendWorkOrderAlert(order: WorkOrder, context?: WorkOrderAlertContext, recipient?: string): Promise<NotificationResult>;
  sendCard(card: Record<string, unknown>, recipient?: string): Promise<NotificationResult>;
  sendText(text: string, recipient?: string, receiveIdType?: 'chat_id' | 'open_id'): Promise<NotificationResult>;
  updateCard(messageId: string, card: Record<string, unknown>): Promise<NotificationResult>;
  sendTest(recipient?: string): Promise<NotificationResult>;
}

function callbackButton(text: string, value: Record<string, string>, type: 'default' | 'primary' = 'default', disabled = false) {
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

function workOrderIdentifier(order: WorkOrder) {
  return order.recordId || order.id || order.workOrderNo;
}

export function buildHighRiskWorkOrderCard(order: WorkOrder, context: WorkOrderAlertContext = {}) {
  const baseUrl = env.APP_BASE_URL.replace(/\/$/, '');
  const workOrderId = workOrderIdentifier(order);
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
  const terminal = ['已完成', '已取消'].includes(order.status);
  return {
    schema: '2.0',
    config: { update_multi: true, enable_forward: true, summary: { content: `【${order.riskLevel}工单】${order.deviceName}需要协同处置` } },
    header: {
      template: order.riskLevel === '高风险' ? 'red' : 'orange',
      title: { tag: 'plain_text', content: `【${order.riskLevel}工单】${order.deviceName}需要协同处置` },
    },
    body: { direction: 'vertical', vertical_spacing: '8px', elements: [
      { tag: 'markdown', content: `**工单编号：**${order.workOrderNo}\n**设备名称：**${order.deviceName}\n**设备编号：**${order.deviceId}\n**故障部位：**${order.faultPart}\n**故障类型：**${order.faultType}\n**风险等级：**${order.riskLevel}\n**温度：**${temperature}\n**振动：**${vibration}\n**健康度：**${healthScore}\n**故障概率：**${probability}\n**建议时限：**${suggestedDeadline}\n**当前状态：**${order.status}\n\n> 模拟监测数据与规则型辅助研判，仅供比赛演示和现场复核参考。` },
      callbackButton(order.status === '待接单' ? '确认接单' : `当前：${order.status}`, { action: 'accept_work_order', workOrderId, workOrderNo: order.workOrderNo }, 'primary', order.status !== '待接单'),
      linkButton('查看3D定位', twinUrl),
      linkButton('查看工单详情', detailUrl),
      callbackButton('暂缓处理', { action: 'defer_work_order', workOrderId, workOrderNo: order.workOrderNo }, 'default', terminal),
    ] },
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
  async sendAlert(alert: Alert) { return this.deliver(buildAlertCard(alert), 'alert'); }
  async sendWorkOrderAlert(order: WorkOrder, context?: WorkOrderAlertContext) { return this.deliver(buildHighRiskWorkOrderCard(order, context), 'work-order'); }
  async sendCard(card: Record<string, unknown>) { return this.deliver(card, 'card'); }
  async sendText(text: string) { return this.deliver({ msg_type: 'text', content: { text } }, 'text'); }
  async updateCard(messageId: string, card: Record<string, unknown>) { return { ...this.deliver(card, 'update'), messageId }; }
  async sendTest() {
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
