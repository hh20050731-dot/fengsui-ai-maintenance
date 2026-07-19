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
  it('辅助研判按九类问题返回不同答案并回显真实问题', async () => {
    const { app } = createApp({ forceMock: true });
    const questions = [
      '当前风险最高的设备是什么？',
      '当前有哪些高风险设备？',
      '1号引风机当前状态如何？',
      '当前有哪些待处理工单？',
      '当前备件库存是否满足维修需求？',
      '哪台设备应该优先检修？',
      '为什么判断1号引风机存在轴承温升风险？',
      '最近哪些指标异常？',
      '今天天气怎么样？',
    ];
    const answers = [];
    for (const question of questions) {
      const response = await request(app).post('/api/ai/diagnose').send({ deviceId: 'IDF-002', question }).expect(200);
      expect(response.body.data.question).toBe(question);
      answers.push(response.body.data);
    }
    expect(new Set(answers.map((item) => item.intent))).toHaveLength(9);
    expect(new Set(answers.map((item) => item.riskJudgment))).toHaveLength(9);
    expect(answers[0].deviceId).toBe('LTP-001');
    expect(answers[1].riskJudgment).toContain('高风险设备');
    expect(answers[2].deviceId).toBe('IDF-001');
    expect(answers[3].riskJudgment).toContain('待处理工单');
    expect(answers[4].riskJudgment).toContain('备件');
    expect(answers[5].riskJudgment).toContain('优先');
    expect(answers[6].intent).toBe('diagnosis_reason');
    expect(answers[7].intent).toBe('abnormal_metrics');
    expect(answers[8].intent).toBe('unsupported_or_ambiguous');
    expect(answers[8].riskJudgment).toContain('未执行固定设备诊断');
  });

  it('查询设备与模拟通知', async () => {
    const { app } = createApp({ forceMock: true });
    const equipment = await request(app).get('/api/equipment').expect(200);
    expect(equipment.body.success).toBe(true); expect(equipment.body.data).toHaveLength(12);
    expect(equipment.body.data[0].deviceName).toBe('1号引风机');
    const integration = await request(app).get('/api/integration/status').expect(200);
    expect(integration.body.data.capabilities.workOrders.mode).toBe('mock');
    expect(integration.body.data.capabilities.equipment.mode).toBe('mock');
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
    const accepted = await advance('已接单');
    expect(accepted.body.data.status).toBe('已接单');
    const duplicateAccepted = await advance('已接单');
    expect(duplicateAccepted.body.data.status).toBe('已接单');
    expect(duplicateAccepted.body.data.processingRecord.filter((item: { action: string }) => item.action.includes('待接单 → 已接单'))).toHaveLength(1);
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

  it('非法JSON返回400且不会泄露内部堆栈', async () => {
    const { app } = createApp({ forceMock: true });
    const result = await request(app)
      .post('/api/ai/diagnose')
      .set('content-type', 'application/json')
      .send('{broken-json')
      .expect(400);
    expect(result.body.error).toEqual({ code: 'INVALID_JSON', message: '请求体不是合法 JSON' });
    expect(JSON.stringify(result.body)).not.toContain('stack');
  });

  it('不存在的工单状态更新返回明确404', async () => {
    const { app } = createApp({ forceMock: true });
    const result = await request(app).post('/api/work-orders/WO-NOT-EXISTS/transition').send({ targetStatus: '已接单', operator: '黄浩', note: '不存在工单', idempotencyKey: 'missing-order-001' }).expect(404);
    expect(result.body.error.code).toBe('WORK_ORDER_NOT_FOUND');
    expect(result.body.error.message).toContain('未找到维修工单');
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
    const verificationToken = 'verification-token-for-app-test';
    const { app } = createApp({ forceMock: true, verificationToken });
    await request(app).post('/api/feishu/events').send({ challenge: 'challenge-value', token: verificationToken }).expect(200, { challenge: 'challenge-value' });
    await request(app).post('/api/feishu/events').send({ challenge: 'missing-token' }).expect(401);
    const payload = { schema: '2.0', header: { token: verificationToken, event_id: 'evt-card-001', event_type: 'card.action.trigger' }, event: { operator: { open_id: 'ou_local_test_user' }, action: { tag: 'button', value: { action: 'acknowledge', alertId: 'ALT-20260717-001' } } } };
    const first = await request(app).post('/api/feishu/events').send(payload).expect(200);
    expect(first.body.toast.content).toBe('预警已确认');
    const duplicate = await request(app).post('/api/feishu/events').send(payload).expect(200);
    expect(duplicate.body.data.duplicate).toBe(true);
  });

  it('未配置Verification Token时回调端点关闭而非默认放行', async () => {
    const { app } = createApp({ forceMock: true, verificationToken: '' });
    const result = await request(app).post('/api/feishu/events').send({ challenge: 'x' }).expect(503);
    expect(result.body.error.code).toBe('EVENT_VERIFICATION_NOT_CONFIGURED');
  });

  it('自动督办与日报接口必须通过CRON_SECRET鉴权', async () => {
    const { app } = createApp({ forceMock: true, cronSecret: 'local-test-cron-secret-123456' });
    await request(app).post('/api/jobs/work-order-reminders').expect(401);
    await request(app).post('/api/jobs/work-order-reminders').set('x-cron-secret', 'wrong-local-secret').expect(401);
    const reminders = await request(app)
      .post('/api/jobs/work-order-reminders')
      .set('authorization', 'Bearer local-test-cron-secret-123456')
      .expect(200);
    expect(reminders.body.success).toBe(true);
    const brief = await request(app)
      .post('/api/jobs/daily-operations-brief')
      .set('x-cron-secret', 'local-test-cron-secret-123456')
      .expect(200);
    expect(brief.body.data.brief.equipment.total).toBe(12);
    expect(brief.body.data.delivery.delivered).toBe(true);
  });

  it('未配置CRON_SECRET时任务接口返回503且不执行任务', async () => {
    const { app } = createApp({ forceMock: true, cronSecret: '' });
    const result = await request(app).post('/api/jobs/daily-operations-brief').expect(503);
    expect(result.body.error.code).toBe('CRON_NOT_CONFIGURED');
  });
});
