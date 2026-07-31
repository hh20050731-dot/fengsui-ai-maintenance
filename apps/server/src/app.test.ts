import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { DemoJournalEntry, InspectionRecord, WorkOrder } from '@fengsui/shared';
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
  it('CORS 只允许明确白名单来源和必要方法、请求头', async () => {
    const allowedOrigin = 'https://dcniaqwtmoca.aiforce.cloud';
    const { app } = createApp({ forceMock: true, allowedOrigins: [allowedOrigin] });
    const allowed = await request(app)
      .options('/api/inspections')
      .set('origin', allowedOrigin)
      .set('access-control-request-method', 'POST')
      .set('access-control-request-headers', 'Content-Type,X-Request-Id,X-Idempotency-Key')
      .expect(204);
    expect(allowed.headers['access-control-allow-origin']).toBe(allowedOrigin);
    expect(allowed.headers['access-control-allow-methods']).toBe('GET,POST,PATCH,OPTIONS');
    expect(allowed.headers['access-control-allow-headers'])
      .toBe('Content-Type,Authorization,X-Request-Id,X-Idempotency-Key');

    const denied = await request(app)
      .options('/api/inspections')
      .set('origin', 'https://untrusted.example')
      .set('access-control-request-method', 'POST')
      .expect(404);
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    expect(denied.body.error.code).toBe('NOT_FOUND');
  });

  it('健康检查返回版本、运行模式与可核对的Git SHA字段', async () => {
    const { app } = createApp({ forceMock: true });
    const response = await request(app).get('/api/health').expect(200);
    expect(response.body.data).toMatchObject({ status: 'ok', version: '1.0.2', mode: 'mock', gitSha: expect.any(String) });
  });

  it('集成状态逐模块返回安全状态且不暴露内部标识', async () => {
    const { app } = createApp({ forceMock: true });
    const response = await request(app).get('/api/integration/status').expect(200);
    expect(response.body.data.services).toMatchObject({
      applicationCredentials: { configured: expect.any(Boolean), available: expect.any(Boolean), mode: expect.any(String) },
      workOrderTable: { safeErrorCode: null },
      directory: { safeErrorCode: 'CONTACT_PERMISSION_NOT_PROBED' },
      rag: { available: true, authenticated: true },
      agent: { available: true },
      multimodal: { available: true },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/app_secret|tenant_access_token|chat_id/i);
  });

  it('提供可追溯RAG、结构化研判、受控Agent和多模态安全降级接口', async () => {
    const { app } = createApp({ forceMock: true });
    const rag = await request(app).post('/api/rag/search').send({ query: '引风机轴承温升', limit: 5 }).expect(200);
    expect(rag.body.data.citations.length).toBeGreaterThan(0);
    expect(rag.body.data.citations[0]).toMatchObject({ title: expect.any(String), sourceRef: expect.any(String), excerpt: expect.any(String) });
    await request(app).post('/api/rag/documents').send({ documentId: 'DOC-API-LOCAL', title: '本地检修规程', sourceType: '检修指南', sourceRef: 'manual:api-test', deviceTypes: ['引风机'], faultTypes: ['轴承温升'], riskLevels: ['预警'], content: '检查轴承温度与润滑状态。复核轴承间隙、联轴器对中和冷却条件。' }).expect(201);
    const importedRag = await request(app).post('/api/rag/search').send({ query: '轴承温升润滑状态联轴器', deviceType: '引风机', limit: 5 }).expect(200);
    expect(importedRag.body.data.citations).toEqual(expect.arrayContaining([expect.objectContaining({ documentId: 'DOC-API-LOCAL', sourceRef: 'manual:api-test' })]));

    const structured = await request(app).post('/api/ai/structured-diagnose').send({ deviceId: 'IDF-001', question: '为什么存在轴承温升风险？' }).expect(200);
    expect(structured.body.data.deviceId).toBe('IDF-001');
    expect(structured.body.data.citations.length).toBeGreaterThan(0);
    expect(structured.body.data.limitations.join('')).toContain('比赛演示');

    const agent = await request(app).post('/api/agent/run').send({ deviceId: 'IDF-001', task: '执行风险研判与检修准备', maxSteps: 10, timeoutMs: 12_000, confirmCreateWorkOrder: false, operator: '黄浩' }).expect(200);
    expect(agent.body.data.status).toBe('awaiting_confirmation');
    expect(agent.body.data.steps.map((item: { toolName: string }) => item.toolName)).toContain('searchKnowledgeBase');
    expect(agent.body.data.workOrderId).toBeUndefined();

    const image = Buffer.from('competition-demo-image').toString('base64');
    const multimodal = await request(app).post('/api/multimodal/inspect').send({ deviceId: 'IDF-001', fileName: '现场照片.png', mediaType: '现场照片', mimeType: 'image/png', size: 22, dataUrl: `data:image/png;base64,${image}` }).expect(200);
    expect(multimodal.body.data.provider).toBe('LocalDemonstrationInspectionProvider');
    expect(multimodal.body.data.limitations.join('')).toContain('不能替代现场检测');
  });

  it('RAG无匹配或Repository异常时不伪造引用', async () => {
    const { app } = createApp({ forceMock: true });
    const result = await request(app).post('/api/rag/search').send({ query: '量子星际曲率发动机', limit: 5 }).expect(200);
    expect(result.body.data.citations).toHaveLength(0);
    expect(result.body.data.message).toContain('未检索到');
  });

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
    expect(answers[0].deviceId).toBe('LCP-001');
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
    expect(integration.body.data).toMatchObject({ configured: false, authenticated: false, effectiveMode: 'mock', safeErrorCode: null });
    const notification = await request(app).post('/api/notifications/test').send({}).expect(200);
    expect(notification.body.data.delivered).toBe(true); expect(notification.body.data.messageId).toContain('mock');
  });

  it('巡检 API 完成持久化、幂等、预警和工单关联闭环', async () => {
    const { app } = createApp({ forceMock: true });
    const body = {
      deviceId: 'IDF-001',
      inspectorName: '移动巡检员',
      inspectorUserId: 'miaoda-test-user',
      runningStatus: '运行',
      vibration: 6.8,
      temperature: 86,
      pressure: 0.86,
      current: 101,
      abnormalDescription: '轴承振动与温度偏高',
      imageUrls: ['https://example.com/inspection/idf-001.png'],
      riskLevel: '预警',
      aiSummary: '建议人工复核轴承和润滑状态',
      aiRecommendManualInspection: true,
      isAbnormal: true,
      status: '已提交',
      source: 'miaoda',
      idempotencyKey: 'api-inspection-create-001',
    };
    const created = await request(app).post('/api/inspections').send(body).expect(201);
    const duplicate = await request(app).post('/api/inspections').send(body).expect(201);
    const inspection = created.body.data as InspectionRecord;
    expect(duplicate.body.data.inspectionId).toBe(inspection.inspectionId);
    expect(created.body.meta).toMatchObject({
      inspectionId: inspection.inspectionId,
      saveMode: 'local_repository',
    });
    const list = await request(app).get('/api/inspections').expect(200);
    expect(list.body.data.filter((item: InspectionRecord) => (
      item.inspectionId === inspection.inspectionId
    ))).toHaveLength(1);

    const generated = await request(app)
      .post(`/api/inspections/${inspection.inspectionId}/generate-alert`)
      .send({ operator: '移动巡检员', idempotencyKey: 'api-inspection-alert-001' })
      .expect(201);
    expect(generated.body.data.alert.sourceInspectionId).toBe(inspection.inspectionId);
    const order = await request(app)
      .post(`/api/inspections/${inspection.inspectionId}/create-work-order`)
      .send({
        assignee: '移动巡检员',
        assigneeUserId: 'miaoda-test-user',
        operator: '移动巡检员',
        idempotencyKey: 'api-inspection-order-001',
      })
      .expect(201);
    expect(order.body.data.workOrder).toMatchObject({
      sourceInspectionId: inspection.inspectionId,
      sourceAlertId: generated.body.data.alert.alertId,
    });
    const duplicateOrder = await request(app)
      .post(`/api/inspections/${inspection.inspectionId}/create-work-order`)
      .send({
        assignee: '移动巡检员',
        assigneeUserId: 'miaoda-test-user',
        operator: '移动巡检员',
        idempotencyKey: 'api-inspection-order-002',
      })
      .expect(201);
    expect(duplicateOrder.body.data.workOrder.workOrderNo)
      .toBe(order.body.data.workOrder.workOrderNo);
  });

  it('巡检 API 拒绝 Base64 图片写入记录', async () => {
    const { app } = createApp({ forceMock: true });
    const response = await request(app).post('/api/inspections').send({
      deviceId: 'CWP-001',
      inspectorName: '移动巡检员',
      inspectorUserId: 'miaoda-test-user',
      runningStatus: '运行',
      vibration: 2.5,
      temperature: 60,
      pressure: 0.64,
      current: 69,
      abnormalDescription: '',
      imageUrls: ['data:image/png;base64,AAAA'],
      riskLevel: '正常',
      aiSummary: '',
      aiRecommendManualInspection: false,
      isAbnormal: false,
      status: '已提交',
      source: 'miaoda',
      idempotencyKey: 'api-inspection-invalid-image',
    }).expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
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
