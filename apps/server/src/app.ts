import { createHash, randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import helmet from 'helmet';
import morgan from 'morgan';
import {
  acknowledgeAlertSchema, createWorkOrderSchema, diagnosisRequestSchema, equipmentInputSchema,
  stockChangeSchema, transitionWorkOrderSchema, workOrderRecordSchema,
} from '@fengsui/shared';
import { effectiveMode, env, missingFeishuConfig } from './config/env.js';
import { AppError, errorHandler, notFound } from './middleware/errors.js';
import { DemoAuthProvider, FeishuAuthProvider } from './providers/auth-provider.js';
import { RuleBasedDiagnosisProvider } from './providers/ai-diagnosis-provider.js';
import { FeishuBotNotificationProvider, MockNotificationProvider } from './providers/notification-provider.js';
import { FeishuBitableRepository } from './repositories/feishu-bitable-repository.js';
import { MockRepository } from './repositories/mock-repository.js';
import { OperationsService } from './services/operations-service.js';
import type { User, WorkOrder } from '@fengsui/shared';

const success = <T>(data: T, meta?: Record<string, unknown>) => ({ success: true as const, data, ...(meta ? { meta } : {}) });

export function createApp(options?: { forceMock?: boolean }) {
  const mode = options?.forceMock ? 'mock' : effectiveMode;
  const repository = mode === 'feishu' ? new FeishuBitableRepository() : new MockRepository();
  const notificationProvider = mode === 'feishu' ? new FeishuBotNotificationProvider() : new MockNotificationProvider();
  const authProvider = mode === 'feishu' ? new FeishuAuthProvider() : new DemoAuthProvider();
  const service = new OperationsService(repository, new RuleBasedDiagnosisProvider(), notificationProvider);
  const sessions = new Map<string, User>();
  const processedEvents = new Set<string>();
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  if (env.NODE_ENV !== 'test') app.use(morgan('tiny'));

  app.get('/api/health', (_req, res) => res.json(success({ status: 'ok', version: '1.0.0', mode, time: new Date().toISOString() })));
  app.get('/api/integration/status', (_req, res) => res.json(success({
    requestedMode: env.APP_MODE, effectiveMode: mode, degraded: env.APP_MODE !== mode,
    feishuClient: false, sso: mode === 'feishu' ? '等待端内登录' : '演示身份', bitable: mode === 'feishu' ? '已配置' : '模拟数据仓库',
    robot: mode === 'feishu' && env.FEISHU_NOTIFICATION_CHAT_ID ? '已配置' : mode === 'feishu' ? '缺少默认会话' : '卡片预览',
    aiProvider: 'RuleBasedDiagnosisProvider', version: '1.0.0', lastSyncAt: new Date().toISOString(), missingConfig: missingFeishuConfig,
  })));

  app.post('/api/auth/feishu/login', async (req, res) => {
    const code = typeof req.body?.code === 'string' ? req.body.code : undefined;
    const user = await authProvider.login(code); const sessionId = randomUUID(); sessions.set(sessionId, user);
    res.cookie('fengsui_session', sessionId, { httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production', maxAge: 8 * 3_600_000 });
    res.json(success(user));
  });
  app.get('/api/auth/me', async (req, res) => {
    const session = sessions.get(req.cookies.fengsui_session);
    res.json(success(session ?? await new DemoAuthProvider().login()));
  });

  app.get('/api/dashboard', async (req, res) => res.json(success(await service.dashboard(String(req.query.range ?? '24h')))));
  app.get('/api/equipment', async (req, res) => {
    let rows = await repository.listEquipment();
    const search = String(req.query.search ?? '').trim().toLowerCase();
    if (search) rows = rows.filter((row) => `${row.deviceName}${row.deviceId}${row.deviceType}`.toLowerCase().includes(search));
    for (const key of ['deviceType', 'systemArea', 'riskLevel', 'runningStatus'] as const) if (req.query[key]) rows = rows.filter((row) => row[key] === req.query[key]);
    if (req.query.sort === 'healthAsc') rows.sort((a, b) => a.healthScore - b.healthScore);
    if (req.query.sort === 'healthDesc') rows.sort((a, b) => b.healthScore - a.healthScore);
    res.json(success(rows, { total: rows.length }));
  });
  app.post('/api/equipment', async (req, res) => res.status(201).json(success(await service.createEquipment(equipmentInputSchema.parse(req.body)))));
  app.get('/api/equipment/:id', async (req, res) => {
    const item = await repository.getEquipment(req.params.id); if (!item) throw new AppError(404, 'DEVICE_NOT_FOUND', '未找到设备');
    res.json(success(item));
  });
  app.patch('/api/equipment/:id', async (req, res) => res.json(success(await repository.updateEquipment(req.params.id, equipmentInputSchema.partial().parse(req.body)))));
  app.get('/api/equipment/:id/telemetry', async (req, res) => {
    const points = await repository.getTelemetry(req.params.id); const range = String(req.query.range ?? '24h');
    const rangeHours = range === '30d' ? 720 : range === '7d' ? 168 : 24;
    const inRange = points.filter((point) => Date.now() - new Date(point.timestamp).getTime() <= rangeHours * 3_600_000);
    const desiredPoints = range === '30d' ? 60 : range === '7d' ? 84 : 49;
    const step = Math.max(1, Math.floor(inRange.length / desiredPoints));
    res.json(success(inRange.filter((_, index) => index % step === 0 || index === inRange.length - 1)));
  });
  app.get('/api/equipment/:id/history', async (req, res) => res.json(success(await service.history(req.params.id))));

  app.get('/api/alerts', async (req, res) => {
    let rows = await repository.listAlerts();
    for (const key of ['riskLevel', 'deviceId', 'alertStatus'] as const) if (req.query[key]) rows = rows.filter((row) => row[key] === req.query[key]);
    if (req.query.from) rows = rows.filter((row) => row.alertTime >= String(req.query.from));
    res.json(success(rows, { total: rows.length }));
  });
  app.get('/api/alerts/:id', async (req, res) => { const item = await repository.getAlert(req.params.id); if (!item) throw new AppError(404, 'ALERT_NOT_FOUND', '未找到预警'); res.json(success({ ...item, telemetry: await repository.getTelemetry(item.deviceId), logs: await repository.listOperationLogs(item.alertId) })); });
  app.post('/api/alerts/:id/acknowledge', async (req, res) => { const body = acknowledgeAlertSchema.parse(req.body); res.json(success(await repository.updateAlert(req.params.id, { alertStatus: '已确认', acknowledgedBy: body.operator, acknowledgedAt: new Date().toISOString() }))); });
  app.post('/api/alerts/:id/false-positive', async (req, res) => { const body = acknowledgeAlertSchema.parse(req.body); res.json(success(await repository.updateAlert(req.params.id, { alertStatus: '误报', acknowledgedBy: body.operator, acknowledgedAt: new Date().toISOString(), closedAt: new Date().toISOString() }))); });
  app.post('/api/alerts/:id/create-work-order', async (req, res) => { const body = createWorkOrderSchema.parse(req.body); res.status(201).json(success(await service.createWorkOrderFromAlert(req.params.id, body))); });

  app.get('/api/work-orders', async (req, res) => { let rows = await repository.listWorkOrders(); if (req.query.status) rows = rows.filter((row) => row.status === req.query.status); res.json(success(rows)); });
  app.get('/api/work-orders/:id', async (req, res) => { const item = await repository.getWorkOrder(req.params.id); if (!item) throw new AppError(404, 'WORK_ORDER_NOT_FOUND', '未找到维修工单'); res.json(success(item)); });
  app.post('/api/work-orders', async (req, res) => {
    const body = req.body as Partial<WorkOrder> & { idempotencyKey?: string };
    if (body.sourceAlertId) { const parsed = createWorkOrderSchema.parse(body); res.status(201).json(success(await service.createWorkOrderFromAlert(body.sourceAlertId, parsed))); return; }
    throw new AppError(400, 'SOURCE_REQUIRED', '比赛原型中的工单需从预警创建');
  });
  app.post('/api/work-orders/:id/transition', async (req, res) => res.json(success(await service.transitionWorkOrder(req.params.id, transitionWorkOrderSchema.parse(req.body)))));
  app.post('/api/work-orders/:id/record', async (req, res) => res.json(success(await service.addWorkOrderRecord(req.params.id, workOrderRecordSchema.parse(req.body)))));
  app.post('/api/work-orders/:id/verify', async (req, res) => res.json(success(await service.transitionWorkOrder(req.params.id, transitionWorkOrderSchema.parse({ ...req.body, targetStatus: '已完成' })))));

  app.get('/api/spare-parts', async (req, res) => { let rows = await repository.listSpareParts(); if (req.query.stockStatus) rows = rows.filter((row) => row.stockStatus === req.query.stockStatus); if (req.query.search) rows = rows.filter((row) => row.partName.includes(String(req.query.search))); res.json(success(rows)); });
  app.post('/api/spare-parts/inbound', async (req, res) => res.json(success(await service.stockChange('入库', stockChangeSchema.parse(req.body)))));
  app.post('/api/spare-parts/outbound', async (req, res) => res.json(success(await service.stockChange('出库', stockChangeSchema.parse(req.body)))));
  app.get('/api/spare-parts/:id/transactions', async (req, res) => res.json(success((await repository.listSpareTransactions()).filter((item) => item.partId === req.params.id))));

  app.get('/api/knowledge', async (req, res) => { let rows = await repository.listKnowledge(); if (req.query.search) rows = rows.filter((row) => JSON.stringify(row).includes(String(req.query.search))); res.json(success(rows)); });
  app.post('/api/ai/diagnose', async (req, res) => { const body = diagnosisRequestSchema.parse(req.body); res.json(success(await service.diagnose(body.deviceId, body.question))); });

  app.post('/api/notifications/test', async (req, res) => { const result = await notificationProvider.sendTest(req.body?.recipient); if (!result.delivered) await repository.addOperationLog({ logId: `LOG-${randomUUID()}`, entityType: 'notification', entityId: 'test', action: '机器人消息发送失败', operator: '系统', detail: result.error ?? '未知错误，可重试', timestamp: new Date().toISOString() }); res.json(success(result)); });
  app.post('/api/notifications/alert', async (req, res) => { const alert = await repository.getAlert(String(req.body?.alertId)); if (!alert) throw new AppError(404, 'ALERT_NOT_FOUND', '未找到预警'); const result = await notificationProvider.sendAlert(alert, req.body?.recipient); await repository.addOperationLog({ logId: `LOG-${randomUUID()}`, entityType: 'alert', entityId: alert.alertId, action: result.delivered ? '发送机器人预警消息' : '机器人预警消息发送失败', operator: '系统', detail: result.delivered ? `消息 ID：${result.messageId}` : `${result.error ?? '未知错误'}；允许重试`, timestamp: new Date().toISOString() }); res.json(success(result)); });

  app.post('/api/feishu/events', async (req, res) => {
    if (req.body?.challenge) {
      if (env.FEISHU_VERIFICATION_TOKEN && req.body.token !== env.FEISHU_VERIFICATION_TOKEN) throw new AppError(401, 'INVALID_EVENT_SOURCE', '事件校验令牌不匹配');
      res.json({ challenge: req.body.challenge }); return;
    }
    const header = req.body?.header ?? {};
    if (env.FEISHU_VERIFICATION_TOKEN && (header.token ?? req.body?.token) !== env.FEISHU_VERIFICATION_TOKEN) throw new AppError(401, 'INVALID_EVENT_SOURCE', '事件来源校验失败');
    const actionValue = req.body?.event?.action?.value ?? req.body?.action?.value;
    const eventId = String(header.event_id ?? req.body?.event_id ?? createHash('sha256').update(JSON.stringify({ actionValue, openId: req.body?.open_id ?? req.body?.event?.operator?.operator_id?.open_id })).digest('hex'));
    if (processedEvents.has(eventId)) { res.json(success({ duplicate: true })); return; }
    processedEvents.add(eventId);
    if (actionValue?.action === 'acknowledge' && actionValue.alertId) {
      await repository.updateAlert(String(actionValue.alertId), { alertStatus: '已确认', acknowledgedBy: '飞书卡片操作人', acknowledgedAt: new Date().toISOString() });
      res.json({ toast: { type: 'success', content: '预警已确认' } }); return;
    }
    if (actionValue?.action === 'create_work_order' && actionValue.alertId) {
      const order = await service.createWorkOrderFromAlert(String(actionValue.alertId), { assignee: '张工', assigneeUserId: 'zhang-gong', idempotencyKey: `feishu-event-${eventId}` }, '飞书卡片操作人');
      res.json({ toast: { type: 'success', content: `已创建工单 ${order.workOrderId}` } }); return;
    }
    res.json(success({ received: true, eventId }));
  });

  if (env.NODE_ENV === 'production' && process.env.VERCEL !== '1') {
    const webDist = path.resolve(process.cwd(), 'apps/web/dist');
    if (existsSync(webDist)) {
      app.use(express.static(webDist));
      app.get('/{*splat}', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
    }
  }
  app.use(notFound); app.use(errorHandler);
  return { app, service, repository };
}
