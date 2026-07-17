import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { DemoJournalEntry, WorkOrder } from '@fengsui/shared';
import { createApp } from './app.js';
import { DEMO_JOURNAL_HEADER, encodeDemoJournal } from './services/demo-state-persistence.js';

const persistedDemoFlow: DemoJournalEntry[] = [
  { version: 1, method: 'POST', path: '/alerts/ALT-20260717-001/acknowledge', body: { operator: '黄浩' } },
  { version: 1, method: 'POST', path: '/alerts/ALT-20260717-001/create-work-order', body: { assignee: '张工', assigneeUserId: 'zhang-gong', idempotencyKey: 'persist-create-001' }, resultId: 'WO-DEMO-PERSIST-001' },
  { version: 1, method: 'POST', path: '/work-orders/WO-DEMO-PERSIST-001/transition', body: { targetStatus: '已接单', operator: '黄浩', note: '演示接单', idempotencyKey: 'persist-accept-001' } },
  { version: 1, method: 'POST', path: '/work-orders/WO-DEMO-PERSIST-001/transition', body: { targetStatus: '检修中', operator: '黄浩', note: '开始现场检修', idempotencyKey: 'persist-repair-001' } },
  { version: 1, method: 'POST', path: '/work-orders/WO-DEMO-PERSIST-001/record', body: { operator: '黄浩', detail: '检查润滑状态、轴承间隙和联轴器对中情况' } },
  { version: 1, method: 'POST', path: '/work-orders/WO-DEMO-PERSIST-001/transition', body: { targetStatus: '待验证', operator: '黄浩', note: '维修完成待验证', inspectionResult: '发现轴承润滑状态异常', repairResult: '更换轴承并补充润滑油', consumedSpareParts: [{ partId: 'SP-001', quantity: 1 }, { partId: 'SP-002', quantity: 1 }], idempotencyKey: 'persist-verify-001' } },
  { version: 1, method: 'POST', path: '/work-orders/WO-DEMO-PERSIST-001/transition', body: { targetStatus: '已完成', operator: '黄浩', note: '验证通过', healthScoreAfter: 92, verificationResult: '振动3.1mm/s、温度68℃，稳定运行30分钟', idempotencyKey: 'persist-complete-001' } },
];

describe('Mock API', () => {
  it('查询设备与模拟通知', async () => {
    const { app } = createApp({ forceMock: true });
    const equipment = await request(app).get('/api/equipment').expect(200);
    expect(equipment.body.success).toBe(true); expect(equipment.body.data).toHaveLength(12);
    expect(equipment.body.data[0].deviceName).toBe('1号引风机');
    const notification = await request(app).post('/api/notifications/test').send({}).expect(200);
    expect(notification.body.data.delivered).toBe(true); expect(notification.body.data.messageId).toContain('mock');
  });

  it('完成1号引风机预警—工单—库存—健康恢复闭环并保证幂等', async () => {
    const { app } = createApp({ forceMock: true });
    const alertId = 'ALT-20260717-001';
    const acknowledged = await request(app).post(`/api/alerts/${alertId}/acknowledge`).send({ operator: '黄浩' }).expect(200);
    expect(acknowledged.body.data.alertStatus).toBe('已确认');
    const created = await request(app).post(`/api/alerts/${alertId}/create-work-order`).send({ assignee: '张工', assigneeUserId: 'zhang-gong', idempotencyKey: 'api-create-order-001' }).expect(201);
    const order = created.body.data as WorkOrder; expect(order.status).toBe('待接单');
    const advance = async (targetStatus: string, extra = {}, key = targetStatus) => request(app).post(`/api/work-orders/${order.workOrderId}/transition`).send({ targetStatus, operator: '黄浩', note: '接口测试推进', idempotencyKey: `api-${key}-001`, ...extra }).expect(200);
    expect((await advance('已接单')).body.data.status).toBe('已接单');
    expect((await advance('检修中')).body.data.status).toBe('检修中');
    expect((await advance('待验证', { inspectionResult: '发现轴承润滑状态异常', repairResult: '更换轴承与润滑油', consumedSpareParts: [{ partId: 'SP-001', quantity: 1 }, { partId: 'SP-002', quantity: 1 }] })).body.data.status).toBe('待验证');
    const stockBefore = (await request(app).get('/api/spare-parts').expect(200)).body.data.find((item: any) => item.partId === 'SP-001').currentStock;
    const completeBody = { targetStatus: '已完成', operator: '黄浩', note: '验证通过', healthScoreAfter: 92, verificationResult: '振动3.1mm/s、温度68℃，稳定运行30分钟', idempotencyKey: 'api-complete-001' };
    const completed = await request(app).post(`/api/work-orders/${order.workOrderId}/transition`).send(completeBody).expect(200);
    expect(completed.body.data.status).toBe('已完成'); expect(completed.body.data.healthScoreAfter).toBe(92);
    await request(app).post(`/api/work-orders/${order.workOrderId}/transition`).send(completeBody).expect(200);
    const device = await request(app).get('/api/equipment/IDF-001').expect(200);
    expect(device.body.data.healthScore).toBe(92); expect(device.body.data.riskLevel).toBe('健康'); expect(device.body.data.vibration).toBe(3.1);
    const parts = await request(app).get('/api/spare-parts').expect(200);
    expect(parts.body.data.find((item: any) => item.partId === 'SP-001').currentStock).toBe(stockBefore - 1);
    const alert = await request(app).get(`/api/alerts/${alertId}`).expect(200);
    expect(alert.body.data.alertStatus).toBe('已关闭'); expect(alert.body.data.closedAt).toBeTruthy();
  });

  it('写接口返回明确的参数校验错误', async () => {
    const { app } = createApp({ forceMock: true });
    const result = await request(app).post('/api/spare-parts/outbound').send({ partId: 'SP-001', quantity: -2 }).expect(400);
    expect(result.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('浏览器演示日志可在新实例恢复闭环状态，重复完成不重复扣库存，重置后回到初始状态', async () => {
    const journal = encodeDemoJournal(persistedDemoFlow);
    const { app } = createApp({ forceMock: true });
    const withJournal = () => request(app).get('/api/equipment/IDF-001').set(DEMO_JOURNAL_HEADER, journal);

    const restoredDevice = await withJournal().expect(200);
    expect(restoredDevice.body.data.healthScore).toBe(92);
    expect(restoredDevice.body.data.riskLevel).toBe('健康');

    const restoredOrder = await request(app).get('/api/work-orders/WO-DEMO-PERSIST-001').set(DEMO_JOURNAL_HEADER, journal).expect(200);
    expect(restoredOrder.body.data.status).toBe('已完成');
    expect(restoredOrder.body.data.processingRecord.some((item: { detail: string }) => item.detail.includes('检查润滑状态'))).toBe(true);
    const restoredAlert = await request(app).get('/api/alerts/ALT-20260717-001').set(DEMO_JOURNAL_HEADER, journal).expect(200);
    expect(restoredAlert.body.data.alertStatus).toBe('已关闭');
    const restoredParts = await request(app).get('/api/spare-parts').set(DEMO_JOURNAL_HEADER, journal).expect(200);
    expect(restoredParts.body.data.find((item: { partId: string; currentStock: number }) => item.partId === 'SP-001').currentStock).toBe(5);
    const restoredKnowledge = await request(app).get('/api/knowledge').set(DEMO_JOURNAL_HEADER, journal).expect(200);
    expect(restoredKnowledge.body.data.some((item: { knowledgeId: string }) => item.knowledgeId === 'KB-CANDIDATE-WO-DEMO-PERSIST-001')).toBe(true);

    const completeBody = persistedDemoFlow.at(-1)!.body as object;
    await request(app).post('/api/work-orders/WO-DEMO-PERSIST-001/transition').set(DEMO_JOURNAL_HEADER, journal).send(completeBody).expect(200);
    const afterDuplicate = await request(app).get('/api/spare-parts').set(DEMO_JOURNAL_HEADER, journal).expect(200);
    expect(afterDuplicate.body.data.find((item: { partId: string; currentStock: number }) => item.partId === 'SP-001').currentStock).toBe(5);

    const emptyJournal = encodeDemoJournal([]);
    await request(app).post('/api/demo/reset').set(DEMO_JOURNAL_HEADER, emptyJournal).send({}).expect(200);
    const resetDevice = await request(app).get('/api/equipment/IDF-001').set(DEMO_JOURNAL_HEADER, emptyJournal).expect(200);
    expect(resetDevice.body.data.healthScore).toBe(68);
    expect(resetDevice.body.data.riskLevel).toBe('二级预警');
    const resetAlert = await request(app).get('/api/alerts/ALT-20260717-001').set(DEMO_JOURNAL_HEADER, emptyJournal).expect(200);
    expect(resetAlert.body.data.alertStatus).toBe('待确认');
    const resetParts = await request(app).get('/api/spare-parts').set(DEMO_JOURNAL_HEADER, emptyJournal).expect(200);
    expect(resetParts.body.data.find((item: { partId: string; currentStock: number }) => item.partId === 'SP-001').currentStock).toBe(6);
    const resetKnowledge = await request(app).get('/api/knowledge').set(DEMO_JOURNAL_HEADER, emptyJournal).expect(200);
    expect(resetKnowledge.body.data.some((item: { knowledgeId: string }) => item.knowledgeId === 'KB-CANDIDATE-WO-DEMO-PERSIST-001')).toBe(false);
  });

  it('飞书事件支持挑战校验、卡片动作和重复事件幂等', async () => {
    const { app } = createApp({ forceMock: true });
    await request(app).post('/api/feishu/events').send({ challenge: 'challenge-value' }).expect(200, { challenge: 'challenge-value' });
    const payload = { header: { event_id: 'evt-card-001' }, event: { action: { value: { action: 'acknowledge', alertId: 'ALT-20260717-001' } } } };
    const first = await request(app).post('/api/feishu/events').send(payload).expect(200);
    expect(first.body.toast.content).toBe('预警已确认');
    const duplicate = await request(app).post('/api/feishu/events').send(payload).expect(200);
    expect(duplicate.body.data.duplicate).toBe(true);
  });
});
