import { createMockData } from '@fengsui/shared';
import { describe, expect, it, vi } from 'vitest';
import type { FeishuClient } from './feishu-client.js';
import { RuleBasedDiagnosisProvider } from './ai-diagnosis-provider.js';
import {
  FeishuBotNotificationProvider,
  MockNotificationProvider,
  buildDiagnosisWorkOrderCard,
  buildHighRiskWorkOrderCard,
} from './notification-provider.js';

describe('飞书高风险工单卡片', () => {
  it('包含协同字段、状态动作与辅助入口', () => {
    const pending = createMockData().workOrders.find((item) => item.status === '待接单')!;
    const order = {
      ...pending,
      deviceId: 'IDF-001',
      deviceName: '1号引风机',
      faultDescription: '驱动端轴承温升异常',
      faultPart: '驱动端轴承',
      faultType: '轴承温升异常',
      riskLevel: '高风险' as const,
    };
    const card = buildHighRiskWorkOrderCard(order, {
      temperature: 82,
      vibration: 5.2,
      healthScore: 42,
      failureProbability: 89,
      suggestedDeadline: '24小时内',
    });
    const serialized = JSON.stringify(card);
    expect(card).toMatchObject({ schema: '2.0', body: { elements: expect.any(Array) } });
    for (const field of ['工单编号', '设备名称', '设备编号', '故障部位', '故障类型', '风险等级', '温度', '振动', '健康度', '故障概率', '建议时限', '当前状态']) {
      expect(serialized).toContain(field);
    }
    expect(serialized).toContain('accept_order');
    expect(serialized).toContain('expectedStatus');
    expect(serialized).toContain('version');
    expect(serialized).toContain('待分派');
    expect(serialized).toContain('查看3D定位');
    expect(serialized).toContain('查看工单详情');
    expect(serialized).not.toContain('workOrderNo":');
    expect(serialized).toContain('model=enhanced-v1');
    expect(serialized).toContain('fault=bearing-overheat');
    expect(serialized).toContain(`/work-orders/${order.workOrderNo}`);
  });

  it('按工单状态只提供合法下一步且卡片value严格受限', () => {
    const base = createMockData().workOrders[0]!;
    const cases = [
      ['待接单', 'accept_order'], ['已接单', 'start_process'], ['检修中', 'submit_acceptance'],
      ['待验证', 'approve_completion'], ['已完成', 'create_knowledge_candidate'],
    ] as const;
    for (const [status, action] of cases) {
      const card = buildHighRiskWorkOrderCard({ ...base, status, version: 3, recordId: 'rec_local_test' });
      const json = JSON.stringify(card);
      expect(json).toContain(action);
      const values: Array<Record<string, unknown>> = [];
      JSON.stringify(card, (key, value) => { if (key === 'value' && value?.action) values.push(value); return value; });
      for (const value of values) expect(Object.keys(value).sort()).toEqual(['action', 'expectedStatus', 'recordId', 'version', 'workOrderId'].sort());
      expect(Buffer.byteLength(json, 'utf8')).toBeLessThan(30 * 1024);
    }
  });

  it('Mock模式支持发送与更新卡片预览', async () => {
    const provider = new MockNotificationProvider();
    const card = { header: { title: { content: 'LOCAL SIMULATION' } } };
    const sent = await provider.sendCard(card);
    const updated = await provider.updateCard(sent.messageId, card);
    expect(sent.delivered).toBe(true);
    expect(updated.delivered).toBe(true);
    expect(updated.messageId).toBe(sent.messageId);
  });

  it('设备研判卡片包含真实交互按钮且正常状态不误建工单', async () => {
    const data = createMockData();
    const device = data.equipment.find((item) => item.deviceId === 'IDF-001')!;
    const alert = data.alerts.find((item) => item.deviceId === device.deviceId)!;
    const diagnosis = await new RuleBasedDiagnosisProvider().diagnose({
      question: '查询1号引风机状态',
      intent: 'equipment_status',
      device,
      equipment: data.equipment,
      telemetry: data.telemetry[device.deviceId],
      knowledge: data.knowledge,
      alerts: data.alerts,
    });
    const card = buildDiagnosisWorkOrderCard({ diagnosis, device, alert });
    const serialized = JSON.stringify(card);
    expect(card).toMatchObject({ schema: '2.0', body: { elements: expect.any(Array) } });
    expect(serialized).toContain('生成维修工单');
    expect(serialized).toContain('create_work_order');
    expect(serialized).toContain(alert.alertId);
    expect(serialized).toContain('查看3D定位');

    const healthy = data.equipment.find((item) => item.riskLevel === '健康')!;
    const healthyDiagnosis = await new RuleBasedDiagnosisProvider().diagnose({
      question: `${healthy.deviceName}当前状态如何`,
      intent: 'equipment_status',
      device: healthy,
      equipment: data.equipment,
      telemetry: data.telemetry[healthy.deviceId],
      knowledge: data.knowledge,
      alerts: data.alerts,
    });
    expect(JSON.stringify(buildDiagnosisWorkOrderCard({ diagnosis: healthyDiagnosis, device: healthy }))).not.toContain('create_work_order');
  });

  it('真实Provider使用interactive消息发送并按message_id更新原卡片', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ message_id: 'om_interactive_reply' })
      .mockResolvedValueOnce({});
    const provider = new FeishuBotNotificationProvider({ request } as unknown as Pick<FeishuClient, 'request'>);
    const card = { schema: '2.0', body: { elements: [] } };
    const sent = await provider.sendCard(card, 'oc_current_chat');
    const updated = await provider.updateCard(sent.messageId, card);

    expect(sent).toMatchObject({ delivered: true, messageId: 'om_interactive_reply' });
    expect(updated).toMatchObject({ delivered: true, messageId: 'om_interactive_reply' });
    expect(request).toHaveBeenNthCalledWith(
      1,
      '/im/v1/messages?receive_id_type=chat_id',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"msg_type":"interactive"'),
      }),
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      '/im/v1/messages/om_interactive_reply',
      expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('"msg_type":"interactive"'),
      }),
    );
  });

  it('真实Provider的发送超时或卡片更新失败会返回可重试失败而不抛出', async () => {
    const request = vi.fn().mockRejectedValue(new Error('local simulated timeout'));
    const provider = new FeishuBotNotificationProvider({ request } as unknown as Pick<FeishuClient, 'request'>);
    const card = { schema: '2.0', body: { elements: [] } };
    const sent = await provider.sendCard(card, 'oc_local_test_chat');
    const updated = await provider.updateCard('om_local_test_message', card);
    expect(sent).toMatchObject({ delivered: false, error: 'local simulated timeout' });
    expect(updated).toMatchObject({ delivered: false, error: 'local simulated timeout' });
  });
});
