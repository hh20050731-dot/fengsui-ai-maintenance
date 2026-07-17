import type { Alert } from '@fengsui/shared';
import { env } from '../config/env.js';
import { FeishuClient } from './feishu-client.js';

export interface NotificationResult { messageId: string; delivered: boolean; preview: Record<string, unknown>; error?: string }
export interface NotificationProvider { sendAlert(alert: Alert, recipient?: string): Promise<NotificationResult>; sendTest(recipient?: string): Promise<NotificationResult> }

export function buildAlertCard(alert: Alert) {
  const url = `${env.APP_BASE_URL.replace(/\/$/, '')}/alerts/${alert.alertId}`;
  return {
    config: { wide_screen_mode: true },
    header: { template: alert.riskLevel === '高风险' ? 'red' : 'orange', title: { tag: 'plain_text', content: `【${alert.riskLevel}】${alert.deviceName}健康度下降` } },
    elements: [
      { tag: 'markdown', content: `**设备：**${alert.deviceName}\n**当前工况：**${alert.operatingCondition}\n**健康度：**${alert.healthScore}\n**风险等级：**${alert.riskLevel}\n**异常指标：**${alert.abnormalIndicators.join('、')}\n**疑似原因：**${alert.suspectedCause}\n**建议时限：**${alert.suggestedDeadline}\n**数据说明：**模拟演示数据` },
      { tag: 'action', actions: [
        { tag: 'button', text: { tag: 'plain_text', content: '查看详情' }, type: 'primary', url },
        { tag: 'button', text: { tag: 'plain_text', content: '确认预警' }, value: { action: 'acknowledge', alertId: alert.alertId }, type: 'default' },
        { tag: 'button', text: { tag: 'plain_text', content: '生成工单' }, value: { action: 'create_work_order', alertId: alert.alertId }, type: 'default' },
      ] },
    ],
  };
}

export class MockNotificationProvider implements NotificationProvider {
  async sendAlert(alert: Alert): Promise<NotificationResult> { return { messageId: `mock-${Date.now()}`, delivered: true, preview: buildAlertCard(alert) }; }
  async sendTest(): Promise<NotificationResult> {
    return { messageId: `mock-test-${Date.now()}`, delivered: true, preview: { header: { title: { content: '烽燧测试消息' } }, elements: [{ tag: 'markdown', content: '机器人通道测试成功（模拟演示模式），未向真实会话发送。' }] } };
  }
}

export class FeishuBotNotificationProvider implements NotificationProvider {
  private client = new FeishuClient();
  async sendAlert(alert: Alert, recipient?: string): Promise<NotificationResult> { return this.sendCard(buildAlertCard(alert), recipient); }
  async sendTest(recipient?: string): Promise<NotificationResult> {
    return this.sendCard({ header: { template: 'blue', title: { tag: 'plain_text', content: '烽燧机器人连接测试' } }, elements: [{ tag: 'markdown', content: '连接成功。当前消息仅用于集成验证。' }] }, recipient);
  }
  private async sendCard(card: Record<string, unknown>, recipient?: string): Promise<NotificationResult> {
    const receiveId = recipient || env.FEISHU_NOTIFICATION_CHAT_ID;
    if (!receiveId) return { messageId: '', delivered: false, preview: card, error: '未配置通知会话 ID' };
    try {
      const result = await this.client.request<{ message_id: string }>(`/im/v1/messages?receive_id_type=chat_id`, { method: 'POST', body: JSON.stringify({ receive_id: receiveId, msg_type: 'interactive', content: JSON.stringify(card) }) });
      return { messageId: result.message_id, delivered: true, preview: card };
    } catch (error) {
      return { messageId: '', delivered: false, preview: card, error: error instanceof Error ? error.message : '发送失败' };
    }
  }
}
