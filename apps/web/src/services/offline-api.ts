import {
  assertWorkOrderTransition,
  buildRuleBasedDiagnosis,
  createMockData,
  getDiagnosisIntentRoute,
  getStockStatus,
  matchesWorkOrderIdentifier,
  normalizeWorkOrderIdentity,
  resolveDiagnosisDevice,
  type Alert,
  type DashboardData,
  type Equipment,
  type KnowledgeEntry,
  type SparePart,
  type SparePartTransaction,
  type SparePartUsage,
  type TelemetryPoint,
  type User,
  type WorkOrder,
  type WorkOrderStatus,
} from '@fengsui/shared';
import { generateUuid } from '../utils/generateUuid';

const STORAGE_KEY = 'fengsui.offline.demo.state.v1';
const STATE_VERSION = 1;
type MockData = ReturnType<typeof createMockData>;

interface OfflineDemoState extends MockData {
  version: number;
  idempotency: Record<string, { entity: 'work-order' | 'spare-part'; id: string }>;
}

interface DigitalTwinContext {
  equipmentId: string; faultPart: string; faultType: string; riskLevel: '低' | '中高' | '高'; failureProbability: number;
  healthScore: number; temperature: number; vibration: number; speed: number; current: number; diagnosis: string; advice: string[]; createdAt: string;
}

interface CreateWorkOrderBody {
  assignee: string; assigneeUserId: string; deadline?: string; idempotencyKey: string; digitalTwinContext?: DigitalTwinContext;
}

interface TransitionBody {
  targetStatus: WorkOrderStatus; operator: string; note: string; inspectionResult?: string; repairResult?: string;
  consumedSpareParts?: Array<{ partId: string; quantity: number }>; healthScoreAfter?: number; verificationResult?: string; idempotencyKey: string;
}

export class OfflineApiError extends Error {
  constructor(public code: string, message: string, public details?: unknown) { super(message); }
}

let memoryState: OfflineDemoState | undefined;
const clone = <T>(value: T): T => structuredClone(value);
const uid = (prefix: string) => `${prefix}-${generateUuid()}`;
const nowIso = () => new Date().toISOString();

function initialState(): OfflineDemoState {
  return { version: STATE_VERSION, ...createMockData(), idempotency: {} };
}

function hydrateOfflineWorkOrder(order: WorkOrder): WorkOrder {
  const [derivedPart = '待现场确认', ...derivedType] = order.faultDescription.split('·').map((item) => item.trim()).filter(Boolean);
  return {
    ...normalizeWorkOrderIdentity(order),
    faultPart: order.faultPart || derivedPart,
    faultType: order.faultType || derivedType.join(' · ') || order.faultDescription,
  } as WorkOrder;
}

function isOfflineState(value: unknown): value is OfflineDemoState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<OfflineDemoState>;
  return state.version === STATE_VERSION && Array.isArray(state.equipment) && Array.isArray(state.alerts)
    && Array.isArray(state.workOrders) && Array.isArray(state.spareParts) && Array.isArray(state.knowledge) && Boolean(state.telemetry);
}

function writeState(state: OfflineDemoState) {
  memoryState = state;
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* 保留当前页面内存态，避免存储异常导致白屏 */ }
}

function readState(): OfflineDemoState {
  if (memoryState) return memoryState;
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) as unknown : undefined;
      if (isOfflineState(parsed)) {
        parsed.workOrders = parsed.workOrders.map(hydrateOfflineWorkOrder);
        memoryState = parsed;
        return memoryState;
      }
    } catch { /* 损坏的数据会由固定种子重新生成 */ }
  }
  memoryState = initialState();
  writeState(memoryState);
  return memoryState;
}

export function resetOfflineDemoState() {
  writeState(initialState());
}

function fail(code: string, message: string, details?: unknown): never { throw new OfflineApiError(code, message, details); }
function bodyOf(init?: RequestInit): Record<string, unknown> {
  if (typeof init?.body !== 'string' || !init.body) return {};
  try { return JSON.parse(init.body) as Record<string, unknown>; } catch { return fail('INVALID_JSON', '请求数据不是合法 JSON'); }
}

function addLog(state: OfflineDemoState, entityType: string, entityId: string, action: string, operator: string, detail: string) {
  state.operationLogs.push({ logId: uid('LOG'), entityType, entityId, action, operator, detail, timestamp: nowIso() });
}

function getDevice(state: OfflineDemoState, id: string) { return state.equipment.find((item) => item.deviceId === id) ?? fail('DEVICE_NOT_FOUND', '未找到设备'); }
function getAlert(state: OfflineDemoState, id: string) { return state.alerts.find((item) => item.alertId === id) ?? fail('ALERT_NOT_FOUND', '未找到预警'); }
function getWorkOrder(state: OfflineDemoState, id: string) { return state.workOrders.find((item) => matchesWorkOrderIdentifier(item, id)) ?? fail('WORK_ORDER_NOT_FOUND', '未找到维修工单'); }
function getPart(state: OfflineDemoState, id: string) { return state.spareParts.find((item) => item.partId === id) ?? fail('PART_NOT_FOUND', '未找到备件'); }

function replaceById<T>(rows: T[], key: keyof T, id: string, value: T) {
  const index = rows.findIndex((item) => String(item[key]) === id);
  if (index < 0) fail('ENTITY_NOT_FOUND', '未找到要更新的数据');
  rows[index] = value;
}

function replaceWorkOrder(state: OfflineDemoState, identifier: string, value: WorkOrder) {
  const index = state.workOrders.findIndex((item) => matchesWorkOrderIdentifier(item, identifier));
  if (index < 0) fail('WORK_ORDER_NOT_FOUND', `未找到维修工单：${identifier}`);
  state.workOrders[index] = normalizeWorkOrderIdentity(value) as WorkOrder;
}

function telemetryInRange(state: OfflineDemoState, deviceId: string, range: string) {
  const points = state.telemetry[deviceId] ?? [];
  const rangeHours = range === '30d' ? 720 : range === '7d' ? 168 : 24;
  const inRange = points.filter((point) => Date.now() - new Date(point.timestamp).getTime() <= rangeHours * 3_600_000);
  const desiredPoints = range === '30d' ? 60 : range === '7d' ? 84 : 49;
  const step = Math.max(1, Math.floor(inRange.length / desiredPoints));
  return inRange.filter((_, index) => index % step === 0 || index === inRange.length - 1);
}

function dashboard(state: OfflineDemoState, range: string): DashboardData {
  const { equipment, alerts, workOrders: orders, spareParts: parts } = state;
  const telemetry = Object.values(state.telemetry).flat();
  const rangeHours = range === '30d' ? 720 : range === '7d' ? 168 : 24;
  const bucketMs = (range === '30d' ? 24 : range === '7d' ? 6 : 1) * 3_600_000;
  const buckets = new Map<number, number[]>();
  telemetry.filter((point) => Date.now() - new Date(point.timestamp).getTime() <= rangeHours * 3_600_000).forEach((point) => {
    const bucket = Math.floor(new Date(point.timestamp).getTime() / bucketMs) * bucketMs;
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), point.healthScore]);
  });
  const indicators = alerts.flatMap((alert) => alert.abnormalIndicators);
  const areas = [...new Set(equipment.map((item) => item.systemArea))];
  return {
    statistics: {
      total: equipment.length, healthy: equipment.filter((item) => item.riskLevel === '健康').length,
      attention: equipment.filter((item) => item.riskLevel === '关注').length, warning: equipment.filter((item) => item.riskLevel === '二级预警').length,
      highRisk: equipment.filter((item) => item.riskLevel === '高风险').length,
      todayAlerts: alerts.filter((item) => Date.now() - new Date(item.alertTime).getTime() < 86_400_000).length,
      pendingOrders: orders.filter((item) => !['已完成', '已取消'].includes(item.status)).length,
      lowStock: parts.filter((item) => item.stockStatus !== '充足').length,
    },
    equipment: clone(equipment), recentAlerts: clone(alerts.slice().sort((a, b) => b.alertTime.localeCompare(a.alertTime)).slice(0, 5)),
    pendingWorkOrders: clone(orders.filter((item) => !['已完成', '已取消'].includes(item.status)).slice(0, 5)),
    healthTrend: [...buckets.entries()].sort(([a], [b]) => a - b).map(([time, scores]) => ({ time: new Date(time).toISOString(), health: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) })),
    abnormalDistribution: [...new Set(indicators)].map((name) => ({ name, value: indicators.filter((item) => item === name).length })),
    areaDistribution: areas.map((area) => ({ area, healthy: equipment.filter((item) => item.systemArea === area && item.riskLevel === '健康').length, risk: equipment.filter((item) => item.systemArea === area && item.riskLevel !== '健康').length })),
  };
}

function diagnose(state: OfflineDemoState, selectedDeviceId: string | undefined, question: string) {
  const route = getDiagnosisIntentRoute(question, selectedDeviceId);
  const intent = route.intent;
  const device = route.requiresDevice
    ? resolveDiagnosisDevice(question, state.equipment, selectedDeviceId)
    : undefined;
  if (route.requiresDevice && !device) {
    return fail('DIAGNOSIS_DEVICE_NOT_FOUND', '问题中未识别到设备，请选择设备或在问题中写明设备名称');
  }
  return buildRuleBasedDiagnosis({
    question,
    intent,
    selectedDeviceId,
    equipment: state.equipment,
    device,
    telemetry: device ? state.telemetry[device.deviceId] ?? [] : [],
    alerts: state.alerts,
    workOrders: state.workOrders,
    spareParts: state.spareParts,
    knowledge: state.knowledge,
    providerName: 'RuleBasedDiagnosisProvider（浏览器离线演示）',
  });
}

function resolveUsage(state: OfflineDemoState, items: Array<{ partId: string; quantity: number }>): SparePartUsage[] {
  return items.map((item) => { const part = getPart(state, item.partId); return { ...item, partName: part.partName, unit: part.unit }; });
}

function createWorkOrder(state: OfflineDemoState, alertId: string, body: CreateWorkOrderBody): WorkOrder {
  const cached = state.idempotency[body.idempotencyKey];
  if (cached?.entity === 'work-order') return clone(getWorkOrder(state, cached.id));
  const alert = getAlert(state, alertId);
  if (alert.relatedWorkOrderId) return clone(getWorkOrder(state, alert.relatedWorkOrderId));
  const twin = body.digitalTwinContext;
  if (twin && twin.equipmentId !== alert.deviceId) fail('EQUIPMENT_MISMATCH', '数字孪生场景设备与关联预警设备不一致');
  const partNames = twin?.faultType === '联轴器不对中' ? ['联轴器'] : twin?.faultType === '轴承温升' ? ['风机轴承', '通用润滑油'] : alert.deviceId === 'IDF-001' ? ['风机轴承', '通用润滑油'] : [];
  const required = state.spareParts.filter((part) => partNames.includes(part.partName)).slice(0, 2);
  const riskLevel: WorkOrder['riskLevel'] = twin ? twin.riskLevel === '高' ? '高风险' : twin.riskLevel === '中高' ? '二级预警' : '关注' : alert.riskLevel;
  const workOrderNo = `WO-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${String(state.workOrders.length + 1).padStart(3, '0')}`;
  const createdAt = twin?.createdAt ?? nowIso();
  const order: WorkOrder = {
    id: workOrderNo, workOrderNo, workOrderId: workOrderNo,
    sourceAlertId: alert.alertId, deviceId: alert.deviceId, deviceName: alert.deviceName, riskLevel,
    faultPart: twin?.faultPart ?? (alert.abnormalIndicators.join('、') || '待现场确认'),
    faultType: twin?.faultType ?? alert.suspectedCause,
    faultDescription: twin ? `${twin.faultPart} · ${twin.faultType}；故障概率 ${twin.failureProbability}%；温度 ${twin.temperature}℃、振动 ${twin.vibration} mm/s；辅助研判：${twin.diagnosis}` : `${alert.abnormalIndicators.join('、')}异常：${alert.suspectedCause}`,
    maintenanceSuggestion: twin?.advice ?? alert.maintenanceSuggestion, assignee: body.assignee, assigneeUserId: body.assigneeUserId, createdBy: '黄浩', createdAt, createdTime: createdAt,
    deadline: body.deadline ?? new Date(Date.now() + 24 * 3_600_000).toISOString(), requiredSpareParts: required.map((part) => ({ partId: part.partId, partName: part.partName, quantity: 1, unit: part.unit })), consumedSpareParts: [],
    processingRecord: [{ id: uid('REC'), time: nowIso(), operator: '黄浩', action: '创建工单', detail: twin ? `由预警 ${alert.alertId} 和3D数字孪生“${twin.faultType}”场景生成（离线演示）` : `由预警 ${alert.alertId} 生成（离线演示）` }],
    healthScoreBefore: twin?.healthScore ?? alert.healthScore, status: '待接单',
  };
  state.workOrders.push(order);
  replaceById(state.alerts, 'alertId', alertId, { ...alert, alertStatus: '已生成工单', relatedWorkOrderId: order.workOrderId });
  addLog(state, 'work-order', order.workOrderId, '创建工单', '黄浩', `来源预警 ${alertId}；浏览器离线演示模式`);
  state.idempotency[body.idempotencyKey] = { entity: 'work-order', id: order.workOrderId };
  writeState(state); return clone(order);
}

function completeWorkOrder(state: OfflineDemoState, order: WorkOrder, body: TransitionBody) {
  for (const usage of order.consumedSpareParts) { const part = getPart(state, usage.partId); if (part.currentStock < usage.quantity) fail('INSUFFICIENT_STOCK', `${part.partName}库存不足，无法完成工单`); }
  for (const usage of order.consumedSpareParts) {
    const part = getPart(state, usage.partId); const stock = part.currentStock - usage.quantity;
    replaceById(state.spareParts, 'partId', part.partId, { ...part, currentStock: stock, stockStatus: getStockStatus(stock, part.safeStock), lastOutboundDate: nowIso().slice(0, 10) });
    state.spareTransactions.push({ transactionId: uid('TX'), partId: part.partId, type: '出库', quantity: usage.quantity, time: nowIso(), operator: body.operator, relatedWorkOrderId: order.workOrderId, remark: '工单完工自动扣减（离线演示）', idempotencyKey: `${body.idempotencyKey}-${part.partId}` });
  }
  const score = order.healthScoreAfter ?? 92; const device = getDevice(state, order.deviceId);
  const updatedDevice: Equipment = { ...device, healthScore: score, riskLevel: score >= 90 ? '健康' : score >= 75 ? '关注' : score >= 60 ? '二级预警' : '高风险', runningStatus: '运行', ...(order.deviceId === 'IDF-001' ? { vibration: 3.1, temperature: 68 } : {}), updatedAt: nowIso(), lastMaintenanceDate: nowIso().slice(0, 10) };
  replaceById(state.equipment, 'deviceId', device.deviceId, updatedDevice);
  const point: TelemetryPoint = { timestamp: nowIso(), deviceId: updatedDevice.deviceId, operatingCondition: updatedDevice.operatingCondition, vibration: updatedDevice.vibration, temperature: updatedDevice.temperature, current: updatedDevice.current, pressure: updatedDevice.pressure, speed: updatedDevice.speed, healthScore: score, riskLevel: updatedDevice.riskLevel };
  state.telemetry[order.deviceId] = [...(state.telemetry[order.deviceId] ?? []), point];
  const alert = order.sourceAlertId ? getAlert(state, order.sourceAlertId) : undefined;
  if (alert) replaceById(state.alerts, 'alertId', alert.alertId, { ...alert, alertStatus: '已关闭', closedAt: nowIso() });
  const candidateId = `KB-CANDIDATE-${order.workOrderId}`;
  if (!state.knowledge.some((item) => item.knowledgeId === candidateId)) {
    const candidate: KnowledgeEntry = {
      knowledgeId: candidateId, title: `${updatedDevice.deviceName}维修闭环候选案例`, deviceType: updatedDevice.deviceType, faultPhenomenon: order.faultDescription,
      abnormalIndicators: alert?.abnormalIndicators ?? [], possibleCauses: [alert?.suspectedCause ?? order.faultDescription], inspectionSteps: order.maintenanceSuggestion,
      handlingMethod: [order.repairResult ?? '按维修工单记录处理'], applicableCondition: updatedDevice.operatingCondition,
      safetyReminder: '本条目来自模拟维修闭环，正式采用前需由专业人员复核并结合安全规程。', relatedSpareParts: order.consumedSpareParts.map((item) => item.partName),
      source: '维修工单闭环候选（浏览器离线模拟数据）', updatedAt: nowIso(),
    };
    state.knowledge.push(candidate);
  }
  addLog(state, 'device', order.deviceId, '维修闭环完成', body.operator, `健康度由 ${order.healthScoreBefore} 恢复至 ${score}；形成知识库候选案例`);
}

function transitionWorkOrder(state: OfflineDemoState, id: string, body: TransitionBody): WorkOrder {
  const cached = state.idempotency[body.idempotencyKey]; if (cached?.entity === 'work-order') return clone(getWorkOrder(state, cached.id));
  const order = getWorkOrder(state, id); if (order.status === '已完成') return clone(order);
  try { assertWorkOrderTransition(order.status, body.targetStatus); } catch (error) { return fail('INVALID_TRANSITION', (error as Error).message); }
  if (body.targetStatus === '待验证' && (!body.inspectionResult || !body.repairResult)) fail('REQUIRED_FIELDS', '进入待验证前必须填写检查结果和维修结果');
  if (body.targetStatus === '已完成' && (!body.verificationResult || body.healthScoreAfter === undefined)) fail('REQUIRED_FIELDS', '完成工单前必须填写验证结果和维修后健康度');
  const consumed = body.consumedSpareParts ? resolveUsage(state, body.consumedSpareParts) : order.consumedSpareParts;
  const updated: WorkOrder = { ...order, status: body.targetStatus, inspectionResult: body.inspectionResult ?? order.inspectionResult, repairResult: body.repairResult ?? order.repairResult,
    consumedSpareParts: consumed, healthScoreAfter: body.healthScoreAfter ?? order.healthScoreAfter, verificationResult: body.verificationResult ?? order.verificationResult,
    processingRecord: [...order.processingRecord, { id: uid('REC'), time: nowIso(), operator: body.operator, action: `状态推进：${order.status} → ${body.targetStatus}`, detail: body.note || '按标准流程推进' }],
    ...(body.targetStatus === '已完成' ? { completedAt: nowIso(), completionIdempotencyKey: body.idempotencyKey } : {}) };
  if (body.targetStatus === '已完成') completeWorkOrder(state, updated, body);
  replaceWorkOrder(state, id, updated);
  if (updated.sourceAlertId && body.targetStatus !== '已完成') { const alert = getAlert(state, updated.sourceAlertId); replaceById(state.alerts, 'alertId', alert.alertId, { ...alert, alertStatus: body.targetStatus === '待接单' ? '已生成工单' : '处理中' }); }
  addLog(state, 'work-order', id, '推进工单状态', body.operator, `${order.status} → ${body.targetStatus}；${body.note}`);
  state.idempotency[body.idempotencyKey] = { entity: 'work-order', id }; writeState(state); return clone(updated);
}

function stockChange(state: OfflineDemoState, type: '入库' | '出库', body: Record<string, unknown>): SparePart {
  const key = String(body.idempotencyKey ?? ''); const cached = state.idempotency[key]; if (cached?.entity === 'spare-part') return clone(getPart(state, cached.id));
  const part = getPart(state, String(body.partId ?? '')); const quantity = Number(body.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) fail('INVALID_QUANTITY', '数量必须大于 0');
  if (type === '出库' && part.currentStock < quantity) fail('INSUFFICIENT_STOCK', `${part.partName}库存不足：现有 ${part.currentStock}${part.unit}`);
  const stock = part.currentStock + (type === '入库' ? quantity : -quantity);
  const updated: SparePart = { ...part, currentStock: stock, stockStatus: getStockStatus(stock, part.safeStock), ...(type === '入库' ? { lastInboundDate: nowIso().slice(0, 10) } : { lastOutboundDate: nowIso().slice(0, 10) }) };
  replaceById(state.spareParts, 'partId', part.partId, updated);
  const transaction: SparePartTransaction = { transactionId: uid('TX'), partId: part.partId, type, quantity, time: nowIso(), operator: String(body.operator ?? '黄浩'), remark: String(body.remark ?? '离线演示库存操作'), idempotencyKey: key };
  state.spareTransactions.push(transaction); addLog(state, 'spare-part', part.partId, `${type}登记`, transaction.operator, `${quantity}${part.unit}；${transaction.remark}`);
  if (key) state.idempotency[key] = { entity: 'spare-part', id: part.partId }; writeState(state); return clone(updated);
}

function notificationPreview(alert?: Alert) {
  const title = alert ? `【${alert.riskLevel}】${alert.deviceName}健康度下降` : '烽燧机器人测试消息';
  const content = alert ? `**设备：**${alert.deviceName}\n**健康度：**${alert.healthScore}\n**异常指标：**${alert.abnormalIndicators.join('、')}\n**数据说明：**模拟演示数据（浏览器离线预览）` : '**连接状态：**浏览器离线卡片预览正常\n**数据说明：**不会向真实飞书会话发送';
  return { messageId: `offline-preview-${Date.now()}`, delivered: true, localPreview: true, preview: { header: { title: { tag: 'plain_text', content: title } }, elements: [{ tag: 'markdown', content }] } };
}

export async function handleOfflineApi<T>(path: string, init?: RequestInit): Promise<T> {
  const state = readState(); const url = new URL(path, 'https://offline.fengsui.local'); const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const method = (init?.method ?? 'GET').toUpperCase(); const body = bodyOf(init); let result: unknown;
  if (method === 'GET' && url.pathname === '/health') result = { status: 'ok', version: '1.0.2', mode: 'offline-demo', time: nowIso() };
  else if (method === 'GET' && url.pathname === '/integration/status') result = { requestedMode: 'offline', effectiveMode: 'mock', configured: false, authenticated: false, safeErrorCode: null, degraded: true, partial: false, offlineDemo: true, feishuClient: false, capabilities: Object.fromEntries(['equipment', 'telemetry', 'health', 'alerts', 'workOrders', 'spareParts', 'spareTransactions', 'knowledge', 'operationLogs'].map((name) => [name, { mode: 'mock', effectiveMode: 'mock', configured: false, authenticated: false, safeErrorCode: null }])), sso: '本地演示身份（离线）', bitable: '浏览器本地模拟数据', robot: '本地卡片预览', aiProvider: 'RuleBasedDiagnosisProvider（离线）', version: '1.0.2', lastSyncAt: nowIso(), missingConfig: [] };
  else if (method === 'GET' && url.pathname === '/auth/me') result = { id: 'demo-user', name: '黄浩', role: '项目演示员', source: 'demo' } satisfies User;
  else if (method === 'POST' && url.pathname === '/auth/feishu/login') result = { id: 'demo-user', name: '黄浩', role: '项目演示员（飞书服务不可用，已降级）', source: 'demo' } satisfies User;
  else if (method === 'GET' && url.pathname === '/dashboard') result = dashboard(state, url.searchParams.get('range') ?? '24h');
  else if (method === 'GET' && url.pathname === '/equipment') {
    let rows = clone(state.equipment); const search = (url.searchParams.get('search') ?? '').trim().toLowerCase();
    if (search) rows = rows.filter((row) => `${row.deviceName}${row.deviceId}${row.deviceType}`.toLowerCase().includes(search));
    for (const key of ['deviceType', 'systemArea', 'riskLevel', 'runningStatus'] as const) { const value = url.searchParams.get(key); if (value) rows = rows.filter((row) => row[key] === value); }
    if (url.searchParams.get('sort') === 'healthAsc') rows.sort((a, b) => a.healthScore - b.healthScore); if (url.searchParams.get('sort') === 'healthDesc') rows.sort((a, b) => b.healthScore - a.healthScore); result = rows;
  } else if (method === 'POST' && url.pathname === '/equipment') {
    const input = body as unknown as Omit<Equipment, 'deviceId' | 'healthScore' | 'riskLevel' | 'vibration' | 'temperature' | 'current' | 'pressure' | 'speed' | 'runningHours' | 'lastMaintenanceDate' | 'nextMaintenanceDate' | 'dataSource' | 'updatedAt'>;
    const item: Equipment = { ...input, deviceId: `DEV-${String(state.equipment.length + 1).padStart(3, '0')}`, healthScore: 100, riskLevel: '健康', vibration: 0, temperature: 25, current: 0, pressure: 0, speed: 0, runningHours: 0, lastMaintenanceDate: nowIso().slice(0, 10), nextMaintenanceDate: new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10), dataSource: '模拟数据', updatedAt: nowIso() };
    state.equipment.push(item); state.telemetry[item.deviceId] = []; writeState(state); result = clone(item);
  } else if (segments[0] === 'equipment' && segments[1] && method === 'GET' && segments.length === 2) result = clone(getDevice(state, segments[1]));
  else if (segments[0] === 'equipment' && segments[1] && segments[2] === 'telemetry' && method === 'GET') result = clone(telemetryInRange(state, segments[1], url.searchParams.get('range') ?? '24h'));
  else if (segments[0] === 'equipment' && segments[1] && segments[2] === 'history' && method === 'GET') {
    const alerts = state.alerts.filter((item) => item.deviceId === segments[1]); const workOrders = state.workOrders.filter((item) => item.deviceId === segments[1]);
    const ids = new Set([segments[1], ...alerts.map((item) => item.alertId), ...workOrders.map((item) => item.workOrderId)]);
    result = { alerts: clone(alerts), workOrders: clone(workOrders), logs: clone(state.operationLogs.filter((log) => ids.has(log.entityId))), spareTransactions: clone(state.spareTransactions.filter((tx) => workOrders.some((order) => order.workOrderId === tx.relatedWorkOrderId))) };
  } else if (segments[0] === 'equipment' && segments[1] && method === 'PATCH') {
    const current = getDevice(state, segments[1]); const updated = { ...current, ...body, deviceId: current.deviceId, updatedAt: nowIso() } as Equipment; replaceById(state.equipment, 'deviceId', current.deviceId, updated); writeState(state); result = clone(updated);
  } else if (method === 'GET' && url.pathname === '/alerts') {
    let rows = clone(state.alerts); for (const key of ['riskLevel', 'deviceId', 'alertStatus'] as const) { const value = url.searchParams.get(key); if (value) rows = rows.filter((row) => row[key] === value); }
    const from = url.searchParams.get('from'); if (from) rows = rows.filter((row) => row.alertTime >= from); result = rows;
  } else if (segments[0] === 'alerts' && segments[1] && method === 'GET' && segments.length === 2) {
    const alert = getAlert(state, segments[1]); result = { ...clone(alert), telemetry: clone(state.telemetry[alert.deviceId] ?? []), logs: clone(state.operationLogs.filter((log) => log.entityId === alert.alertId)) };
  } else if (segments[0] === 'alerts' && segments[1] && segments[2] === 'acknowledge' && method === 'POST') {
    const alert = getAlert(state, segments[1]); const updated: Alert = { ...alert, alertStatus: '已确认', acknowledgedBy: String(body.operator ?? '黄浩'), acknowledgedAt: nowIso() }; replaceById(state.alerts, 'alertId', alert.alertId, updated); writeState(state); result = clone(updated);
  } else if (segments[0] === 'alerts' && segments[1] && segments[2] === 'false-positive' && method === 'POST') {
    const alert = getAlert(state, segments[1]); const updated: Alert = { ...alert, alertStatus: '误报', acknowledgedBy: String(body.operator ?? '黄浩'), acknowledgedAt: nowIso(), closedAt: nowIso() }; replaceById(state.alerts, 'alertId', alert.alertId, updated); writeState(state); result = clone(updated);
  } else if (segments[0] === 'alerts' && segments[1] && segments[2] === 'create-work-order' && method === 'POST') result = createWorkOrder(state, segments[1], body as unknown as CreateWorkOrderBody);
  else if (method === 'GET' && url.pathname === '/work-orders') { const status = url.searchParams.get('status'); result = clone(status ? state.workOrders.filter((item) => item.status === status) : state.workOrders); }
  else if (segments[0] === 'work-orders' && segments[1] && method === 'GET' && segments.length === 2) result = clone(getWorkOrder(state, segments[1]));
  else if (segments[0] === 'work-orders' && segments[1] && segments[2] === 'transition' && method === 'POST') result = transitionWorkOrder(state, segments[1], body as unknown as TransitionBody);
  else if (segments[0] === 'work-orders' && segments[1] && segments[2] === 'verify' && method === 'POST') result = transitionWorkOrder(state, segments[1], { ...body, targetStatus: '已完成' } as unknown as TransitionBody);
  else if (segments[0] === 'work-orders' && segments[1] && segments[2] === 'record' && method === 'POST') {
    const order = getWorkOrder(state, segments[1]); const updated: WorkOrder = { ...order, processingRecord: [...order.processingRecord, { id: uid('REC'), time: nowIso(), operator: String(body.operator ?? '黄浩'), action: '补充处理记录', detail: String(body.detail ?? '') }] };
    replaceById(state.workOrders, 'workOrderId', order.workOrderId, updated); writeState(state); result = clone(updated);
  } else if (method === 'GET' && url.pathname === '/spare-parts') {
    let rows = clone(state.spareParts); const status = url.searchParams.get('stockStatus'); const search = url.searchParams.get('search'); if (status) rows = rows.filter((item) => item.stockStatus === status); if (search) rows = rows.filter((item) => item.partName.includes(search)); result = rows;
  } else if (method === 'POST' && url.pathname === '/spare-parts/inbound') result = stockChange(state, '入库', body);
  else if (method === 'POST' && url.pathname === '/spare-parts/outbound') result = stockChange(state, '出库', body);
  else if (segments[0] === 'spare-parts' && segments[1] && segments[2] === 'transactions' && method === 'GET') result = clone(state.spareTransactions.filter((item) => item.partId === segments[1]));
  else if (method === 'GET' && url.pathname === '/knowledge') { const search = url.searchParams.get('search'); result = clone(search ? state.knowledge.filter((item) => JSON.stringify(item).includes(search)) : state.knowledge); }
  else if (method === 'POST' && url.pathname === '/ai/diagnose') result = diagnose(state, typeof body.deviceId === 'string' ? body.deviceId : undefined, String(body.question ?? ''));
  else if (method === 'POST' && url.pathname === '/notifications/test') result = notificationPreview();
  else if (method === 'POST' && url.pathname === '/notifications/alert') result = notificationPreview(getAlert(state, String(body.alertId ?? '')));
  else if (method === 'POST' && url.pathname === '/demo/reset') { resetOfflineDemoState(); result = { reset: true }; }
  else fail('OFFLINE_ROUTE_NOT_SUPPORTED', `离线演示暂不支持 ${method} ${url.pathname}`);
  return clone(result as T);
}

export const offlineDemoStorageKey = STORAGE_KEY;
