import { createMockData } from '@fengsui/shared';
import { describe, expect, it, vi } from 'vitest';
import type { FeishuClient } from './feishu-client.js';
import { FeishuBotNotificationProvider, MockNotificationProvider, buildHighRiskWorkOrderCard } from './notification-provider.js';

describe('飞书高风险工单卡片', () => {
  it('包含协同字段、真实接单动作与三类辅助按钮', () => {
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
    expect(serialized).toContain('accept_work_order');
    expect(serialized).toContain('查看3D定位');
    expect(serialized).toContain('查看工单详情');
    expect(serialized).toContain('defer_work_order');
    expect(serialized).toContain('model=enhanced-v1');
    expect(serialized).toContain('fault=bearing-overheat');
    expect(serialized).toContain(`/work-orders/${order.workOrderNo}`);
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
