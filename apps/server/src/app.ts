import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import helmet from 'helmet';
import morgan from 'morgan';
import {
  acknowledgeAlertSchema, agentRunRequestSchema, createInspectionAlertSchema,
  createInspectionSchema, createInspectionWorkOrderSchema, createWorkOrderSchema,
  diagnosisRequestSchema, equipmentInputSchema, multimodalInspectionRequestSchema,
  ragDocumentImportSchema, ragSearchRequestSchema,
  stockChangeSchema, transitionWorkOrderSchema, workOrderRecordSchema,
  updateInspectionSchema,
} from '@fengsui/shared';
import { buildFeishuCapabilities, effectiveMode, env, feishuClientConfigured, missingFeishuConfig } from './config/env.js';
import { buildCorsOptions, resolveAllowedOrigins } from './config/cors.js';
import { AppError, errorHandler, notFound } from './middleware/errors.js';
import { DemoAuthProvider, FeishuAuthProvider } from './providers/auth-provider.js';
import { RuleBasedDiagnosisProvider } from './providers/ai-diagnosis-provider.js';
import { DoubaoProvider, ResilientAiProvider, RuleBasedFallbackProvider } from './providers/structured-ai-provider.js';
import { FeishuBotNotificationProvider, MockNotificationProvider } from './providers/notification-provider.js';
import { FeishuClient } from './providers/feishu-client.js';
import { FeishuBitableRepository } from './repositories/feishu-bitable-repository.js';
import { MockRepository } from './repositories/mock-repository.js';
import { APP_MODE_HEADER, DEMO_JOURNAL_HEADER, DemoStatePersistence } from './services/demo-state-persistence.js';
import { FeishuCallbackService, safeSecretEqual } from './services/feishu-callback-service.js';
import { buildRuntimeCapabilities, FeishuIntegrationState } from './services/feishu-integration-state.js';
import { OperationsJobsService } from './services/operations-jobs-service.js';
import { OperationsService } from './services/operations-service.js';
import { LocalRagService } from './services/rag-service.js';
import { MaintenanceAgent } from './services/maintenance-agent.js';
import { MultimodalInspectionService } from './services/multimodal-inspection-service.js';
import { InspectionService } from './services/inspection-service.js';
import type { User, WorkOrder } from '@fengsui/shared';

const success = <T>(data: T, meta?: Record<string, unknown>) => ({ success: true as const, data, ...(meta ? { meta } : {}) });

export function createApp(options?: {
  forceMock?: boolean;
  cronSecret?: string;
  verificationToken?: string;
  encryptKey?: string;
  feishuAuthProbe?: () => Promise<unknown>;
  allowedOrigins?: string[];
}) {
  const mode = options?.forceMock ? 'mock' : effectiveMode;
  const capabilities = buildFeishuCapabilities(env, mode);
  const integrationState = new FeishuIntegrationState(mode === 'feishu' && feishuClientConfigured);
  const feishuClient = mode === 'feishu' ? new FeishuClient() : undefined;
  const repository = mode === 'feishu'
    ? new FeishuBitableRepository({ capabilities, client: feishuClient, integrationState })
    : new MockRepository();
  const notificationProvider = mode === 'feishu' ? new FeishuBotNotificationProvider() : new MockNotificationProvider();
  const authProvider = mode === 'feishu' ? new FeishuAuthProvider() : new DemoAuthProvider();
  const service = new OperationsService(repository, new RuleBasedDiagnosisProvider(), notificationProvider, { createKnowledgeCandidates: capabilities.knowledge.mode === 'mock' });
  const inspectionService = new InspectionService(repository, service);
  const demoPersistence = mode === 'mock' ? new DemoStatePersistence(repository as MockRepository, service) : undefined;
  const sessions = new Map<string, User>();
  const callbackService = new FeishuCallbackService(repository, service, notificationProvider, {
    verificationToken: options?.verificationToken ?? env.FEISHU_VERIFICATION_TOKEN,
    encryptKey: options?.encryptKey ?? env.FEISHU_ENCRYPT_KEY,
  });
  const jobsService = new OperationsJobsService(repository, notificationProvider);
  const ragService = new LocalRagService(repository);
  const maintenanceAgent = new MaintenanceAgent(repository, service, ragService);
  const structuredAiProvider = new ResilientAiProvider(
    new DoubaoProvider({ apiKey: env.DOUBAO_API_KEY, model: env.DOUBAO_MODEL, baseUrl: env.DOUBAO_BASE_URL }),
    new RuleBasedFallbackProvider(),
  );
  const multimodalService = new MultimodalInspectionService(repository, ragService);
  const cronSecret = options?.cronSecret ?? env.CRON_SECRET;
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors(buildCorsOptions(
    options?.allowedOrigins ?? resolveAllowedOrigins(env.CORS_ALLOWED_ORIGINS),
    [APP_MODE_HEADER],
  )));
  app.use(express.json({ limit: '12mb' }));
  app.use(cookieParser());
  if (env.NODE_ENV !== 'test') app.use(morgan('tiny'));

  let demoRequestQueue = Promise.resolve();
  app.use((req, res, next) => {
    res.setHeader(APP_MODE_HEADER, mode);
    const encodedJournal = req.header(DEMO_JOURNAL_HEADER);
    if (!demoPersistence || encodedJournal === undefined) { next(); return; }

    const previousRequest = demoRequestQueue;
    let releaseRequest!: () => void;
    demoRequestQueue = new Promise<void>((resolve) => { releaseRequest = resolve; });
    void previousRequest.then(async () => {
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        releaseRequest();
      };
      try {
        await demoPersistence.restore(encodedJournal);
        res.once('finish', release);
        res.once('close', release);
        next();
      } catch (error) {
        release();
        next(error);
      }
    });
  });

  app.post('/api/demo/reset', (_req, res) => {
    if (!demoPersistence) throw new AppError(409, 'DEMO_MODE_REQUIRED', '飞书数据模式不使用浏览器演示数据');
    demoPersistence.reset();
    res.json(success({ reset: true }));
  });

  app.get('/api/health', (_req, res) => res.json(success({
    status: 'ok',
    version: '1.0.2',
    mode,
    gitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? 'local',
    time: new Date().toISOString(),
  })));
  app.get('/api/integration/status', async (_req, res) => {
    if (mode === 'feishu' && feishuClientConfigured && feishuClient) {
      try {
        await (options?.feishuAuthProbe ?? (() => feishuClient.getTenantAccessToken()))();
        integrationState.markAuthenticated();
      } catch (error) {
        integrationState.markFailure(error);
      }
    }
    const authentication = integrationState.snapshot();
    const runtimeCapabilities = buildRuntimeCapabilities(capabilities, authentication);
    const workOrderCapability = runtimeCapabilities.workOrders!;
    const knowledgeCapability = runtimeCapabilities.knowledge!;
    const operationLogCapability = runtimeCapabilities.operationLogs!;
    const inspectionCapability = runtimeCapabilities.inspections!;
    const runtimeMode = mode === 'feishu' && authentication.authenticated ? 'feishu' : 'mock';
    const partialFeishu = runtimeMode === 'feishu'
      && Object.values(runtimeCapabilities).some((capability) => capability.effectiveMode === 'mock');
    const checkedAt = authentication.checkedAt ?? new Date().toISOString();
    const serviceState = (configured: boolean, available: boolean, serviceMode: string, safeErrorCode: string | null = null, authenticated = configured && authentication.authenticated) => ({
      configured, authenticated, available, mode: serviceMode,
      safeErrorCode, lastSuccessAt: available ? checkedAt : null,
    });
    const aiStatus = structuredAiProvider.status();
    const doubaoConfigured = Boolean(env.DOUBAO_API_KEY && env.DOUBAO_MODEL);
    res.json(success({
      requestedMode: env.APP_MODE,
      effectiveMode: runtimeMode,
      configured: authentication.configured,
      authenticated: authentication.authenticated,
      safeErrorCode: authentication.safeErrorCode,
      degraded: env.APP_MODE === 'feishu' && runtimeMode !== 'feishu',
      partial: partialFeishu,
      feishuClient: authentication.authenticated,
      capabilities: runtimeCapabilities,
      sso: runtimeMode === 'feishu' ? '等待端内登录' : env.APP_MODE === 'feishu' ? '飞书鉴权不可用，使用演示身份' : '演示身份',
      bitable: runtimeMode === 'feishu' ? Object.values(runtimeCapabilities).every((capability) => capability.effectiveMode === 'feishu') ? '已配置' : '已部分配置' : '模拟数据仓库',
      robot: runtimeMode === 'feishu' && env.FEISHU_NOTIFICATION_CHAT_ID ? '已配置' : runtimeMode === 'feishu' ? '缺少默认会话' : '卡片预览',
      callbacks: { verificationConfigured: Boolean(options?.verificationToken ?? env.FEISHU_VERIFICATION_TOKEN), encryptionConfigured: Boolean(options?.encryptKey ?? env.FEISHU_ENCRYPT_KEY) },
      scheduledJobs: { configured: Boolean(cronSecret) },
      services: {
        applicationCredentials: serviceState(feishuClientConfigured, authentication.authenticated, runtimeMode, authentication.safeErrorCode),
        tenantAccessToken: serviceState(authentication.configured, authentication.authenticated, runtimeMode, authentication.safeErrorCode),
        workOrderTable: serviceState(capabilities.workOrders.configured, workOrderCapability.effectiveMode === 'feishu', workOrderCapability.effectiveMode, workOrderCapability.safeErrorCode),
        equipmentTable: serviceState(capabilities.equipment.configured, runtimeCapabilities.equipment!.effectiveMode === 'feishu', runtimeCapabilities.equipment!.effectiveMode, runtimeCapabilities.equipment!.safeErrorCode),
        alertTable: serviceState(capabilities.alerts.configured, runtimeCapabilities.alerts!.effectiveMode === 'feishu', runtimeCapabilities.alerts!.effectiveMode, runtimeCapabilities.alerts!.safeErrorCode),
        inspectionTable: serviceState(capabilities.inspections.configured, inspectionCapability.effectiveMode === 'feishu', inspectionCapability.effectiveMode, inspectionCapability.safeErrorCode),
        sparePartTable: serviceState(capabilities.spareParts.configured, runtimeCapabilities.spareParts!.effectiveMode === 'feishu', runtimeCapabilities.spareParts!.effectiveMode, runtimeCapabilities.spareParts!.safeErrorCode),
        knowledgeTable: serviceState(capabilities.knowledge.configured, knowledgeCapability.effectiveMode === 'feishu', knowledgeCapability.effectiveMode, knowledgeCapability.safeErrorCode),
        operationLogTable: serviceState(capabilities.operationLogs.configured, operationLogCapability.effectiveMode === 'feishu', operationLogCapability.effectiveMode, operationLogCapability.safeErrorCode),
        notificationChat: serviceState(Boolean(env.FEISHU_NOTIFICATION_CHAT_ID), runtimeMode === 'feishu' && Boolean(env.FEISHU_NOTIFICATION_CHAT_ID), runtimeMode === 'feishu' ? 'feishu' : 'mock'),
        stockNotificationChat: serviceState(Boolean(env.FEISHU_STOCK_NOTIFICATION_CHAT_ID), runtimeMode === 'feishu' && Boolean(env.FEISHU_STOCK_NOTIFICATION_CHAT_ID), runtimeMode === 'feishu' ? 'feishu' : 'mock'),
        websocket: serviceState(feishuClientConfigured, process.env.FEISHU_WS === '1' && authentication.authenticated, process.env.FEISHU_WS === '1' ? 'local-ws' : 'standby', process.env.FEISHU_WS === '1' ? authentication.safeErrorCode : 'NOT_RUNNING_IN_THIS_PROCESS'),
        messageEvents: serviceState(Boolean(env.FEISHU_VERIFICATION_TOKEN) || process.env.FEISHU_WS === '1', authentication.authenticated && (Boolean(env.FEISHU_VERIFICATION_TOKEN) || process.env.FEISHU_WS === '1'), process.env.FEISHU_WS === '1' ? 'websocket' : 'webhook'),
        cardCallbacks: serviceState(Boolean(env.FEISHU_VERIFICATION_TOKEN) || process.env.FEISHU_WS === '1', authentication.authenticated && (Boolean(env.FEISHU_VERIFICATION_TOKEN) || process.env.FEISHU_WS === '1'), process.env.FEISHU_WS === '1' ? 'websocket' : 'webhook'),
        directory: serviceState(feishuClientConfigured, false, 'permission-check-required', 'CONTACT_PERMISSION_NOT_PROBED'),
        doubao: { configured: doubaoConfigured, authenticated: doubaoConfigured && aiStatus.provider === 'doubao' && aiStatus.available, available: doubaoConfigured && aiStatus.provider === 'doubao' && aiStatus.available, mode: doubaoConfigured ? aiStatus.provider : 'rule-based-fallback', safeErrorCode: doubaoConfigured ? (aiStatus.safeErrorCode ?? null) : 'DOUBAO_NOT_CONFIGURED', lastSuccessAt: doubaoConfigured && aiStatus.provider === 'doubao' && aiStatus.available ? checkedAt : null },
        rag: serviceState(true, true, 'local-rag', null, true),
        agent: serviceState(true, true, 'controlled-agent', null, true),
        multimodal: serviceState(true, true, 'rule-fallback', null, true),
      },
      aiProvider: 'RuleBasedDiagnosisProvider', version: '1.0.2', lastSyncAt: new Date().toISOString(), missingConfig: missingFeishuConfig,
    }));
  });

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

  app.get('/api/inspections', async (req, res) => {
    let rows = await inspectionService.list();
    if (req.query.deviceId) rows = rows.filter((row) => row.deviceId === req.query.deviceId);
    if (req.query.status) rows = rows.filter((row) => row.status === req.query.status);
    if (req.query.from) rows = rows.filter((row) => row.inspectionTime >= String(req.query.from));
    rows.sort((left, right) => right.inspectionTime.localeCompare(left.inspectionTime));
    res.json(success(rows, { total: rows.length }));
  });
  app.post('/api/inspections', async (req, res) => {
    const record = await inspectionService.create(createInspectionSchema.parse(req.body));
    res.status(201).json(success(record, {
      inspectionId: record.inspectionId,
      saveMode: record.saveMode,
    }));
  });
  app.post('/api/inspections/:id/generate-alert', async (req, res) => {
    const input = createInspectionAlertSchema.parse(req.body);
    res.status(201).json(success(await inspectionService.createAlert(req.params.id, input)));
  });
  app.post('/api/inspections/:id/create-work-order', async (req, res) => {
    const input = createInspectionWorkOrderSchema.parse(req.body);
    res.status(201).json(success(await inspectionService.createWorkOrder(req.params.id, input)));
  });
  app.get('/api/inspections/:id', async (req, res) => {
    res.json(success(await inspectionService.get(req.params.id)));
  });
  app.patch('/api/inspections/:id', async (req, res) => {
    res.json(success(await inspectionService.update(
      req.params.id,
      updateInspectionSchema.parse(req.body),
    )));
  });

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
  app.post('/api/work-orders/:id/resync', async (req, res) => res.json(success(await service.resyncWorkOrder(req.params.id))));
  app.post('/api/work-orders/:id/resend-notification', async (req, res) => {
    const operator = typeof req.body?.operator === 'string' && req.body.operator.trim()
      ? req.body.operator.trim()
      : '当前操作人';
    res.json(success(await service.resendWorkOrderNotification(req.params.id, operator)));
  });
  app.post('/api/work-orders/:id/record', async (req, res) => res.json(success(await service.addWorkOrderRecord(req.params.id, workOrderRecordSchema.parse(req.body)))));
  app.post('/api/work-orders/:id/verify', async (req, res) => res.json(success(await service.transitionWorkOrder(req.params.id, transitionWorkOrderSchema.parse({ ...req.body, targetStatus: '已完成' })))));

  app.get('/api/spare-parts', async (req, res) => { let rows = await repository.listSpareParts(); if (req.query.stockStatus) rows = rows.filter((row) => row.stockStatus === req.query.stockStatus); if (req.query.search) rows = rows.filter((row) => row.partName.includes(String(req.query.search))); res.json(success(rows)); });
  app.post('/api/spare-parts/inbound', async (req, res) => res.json(success(await service.stockChange('入库', stockChangeSchema.parse(req.body)))));
  app.post('/api/spare-parts/outbound', async (req, res) => res.json(success(await service.stockChange('出库', stockChangeSchema.parse(req.body)))));
  app.get('/api/spare-parts/:id/transactions', async (req, res) => res.json(success((await repository.listSpareTransactions()).filter((item) => item.partId === req.params.id))));

  app.get('/api/knowledge', async (req, res) => { let rows = await repository.listKnowledge(); if (req.query.search) rows = rows.filter((row) => JSON.stringify(row).includes(String(req.query.search))); res.json(success(rows)); });
  app.post('/api/rag/search', async (req, res) => res.json(success(await ragService.search(ragSearchRequestSchema.parse(req.body)))));
  app.post('/api/rag/documents', (req, res) => res.status(201).json(success(ragService.importDocument(ragDocumentImportSchema.parse(req.body)))));
  app.get('/api/agent/runs', (_req, res) => res.json(success(maintenanceAgent.listRuns())));
  app.get('/api/agent/runs/:id', (req, res) => { const run = maintenanceAgent.getRun(req.params.id); if (!run) throw new AppError(404, 'AGENT_RUN_NOT_FOUND', '未找到Agent执行记录'); res.json(success(run)); });
  app.post('/api/agent/run', async (req, res) => res.json(success(await maintenanceAgent.run(agentRunRequestSchema.parse(req.body)))));
  app.get('/api/ai/provider/status', (_req, res) => res.json(success(structuredAiProvider.status())));
  app.post('/api/ai/structured-diagnose', async (req, res) => {
    const body = diagnosisRequestSchema.parse(req.body);
    if (!body.deviceId) throw new AppError(400, 'DEVICE_REQUIRED', '结构化研判需要指定设备');
    const device = await repository.getEquipment(body.deviceId);
    if (!device) throw new AppError(404, 'DEVICE_NOT_FOUND', '未找到设备');
    const [telemetry, rag] = await Promise.all([
      repository.getTelemetry(device.deviceId),
      ragService.search({ query: `${device.deviceName} ${body.question}`, deviceType: device.deviceType, limit: 5 }),
    ]);
    res.json(success(await structuredAiProvider.diagnose({ device, telemetry, citations: rag.citations, question: body.question })));
  });
  app.post('/api/multimodal/inspect', async (req, res) => res.json(success(await multimodalService.analyze(multimodalInspectionRequestSchema.parse(req.body)))));
  app.post('/api/ai/diagnose', async (req, res) => { const body = diagnosisRequestSchema.parse(req.body); res.json(success(await service.diagnose(body.deviceId, body.question))); });

  app.post('/api/notifications/test', async (req, res) => { const result = await notificationProvider.sendTest(req.body?.recipient); if (!result.delivered) await repository.addOperationLog({ logId: `LOG-${randomUUID()}`, entityType: 'notification', entityId: 'test', action: '机器人消息发送失败', operator: '系统', detail: result.error ?? '未知错误，可重试', timestamp: new Date().toISOString() }); res.json(success(result)); });
  app.post('/api/notifications/alert', async (req, res) => { const alert = await repository.getAlert(String(req.body?.alertId)); if (!alert) throw new AppError(404, 'ALERT_NOT_FOUND', '未找到预警'); const result = await notificationProvider.sendAlert(alert, req.body?.recipient); await repository.addOperationLog({ logId: `LOG-${randomUUID()}`, entityType: 'alert', entityId: alert.alertId, action: result.delivered ? '发送机器人预警消息' : '机器人预警消息发送失败', operator: '系统', detail: result.delivered ? `消息 ID：${result.messageId}` : `${result.error ?? '未知错误'}；允许重试`, timestamp: new Date().toISOString() }); res.json(success(result)); });

  app.post('/api/feishu/events', async (req, res) => res.json(await callbackService.handle(req.body)));

  const requireCron = (authorization: string | undefined, headerSecret: string | undefined) => {
    if (!cronSecret) throw new AppError(503, 'CRON_NOT_CONFIGURED', '定时任务保护密钥尚未配置');
    const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!safeSecretEqual(headerSecret ?? bearer, cronSecret)) throw new AppError(401, 'INVALID_CRON_SECRET', '定时任务鉴权失败');
  };
  app.post('/api/jobs/work-order-reminders', async (req, res) => {
    requireCron(req.header('authorization'), req.header('x-cron-secret'));
    res.json(success(await jobsService.runWorkOrderReminders()));
  });
  app.post('/api/jobs/daily-operations-brief', async (req, res) => {
    requireCron(req.header('authorization'), req.header('x-cron-secret'));
    res.json(success(await jobsService.runDailyOperationsBrief()));
  });

  if (env.NODE_ENV === 'production' && process.env.VERCEL !== '1') {
    const webDist = path.resolve(process.cwd(), 'apps/web/dist');
    if (existsSync(webDist)) {
      app.use(express.static(webDist));
      app.get('/{*splat}', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
    }
  }
  app.use(notFound); app.use(errorHandler);
  return { app, service, inspectionService, repository, notificationProvider, callbackService, jobsService };
}
