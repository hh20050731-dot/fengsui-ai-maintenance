import {
  getWorkOrderIdentifiers, getWorkOrderNo, isFeishuRecordId, matchesWorkOrderIdentifier, normalizeWorkOrderIdentity,
  type Alert, type Equipment, type KnowledgeEntry, type OperationLog, type SparePart, type SparePartTransaction, type TelemetryPoint, type WorkOrder,
} from '@fengsui/shared';
import { env, feishuCapabilities, type FeishuCapabilities, type FeishuCapabilityName } from '../config/env.js';
import { AppError } from '../middleware/errors.js';
import { FeishuClient, type FeishuBitableRecord } from '../providers/feishu-client.js';
import {
  classifyFeishuIntegrationError,
  FeishuIntegrationState,
  feishuWorkOrderUnavailable,
} from '../services/feishu-integration-state.js';
import { MockRepository } from './mock-repository.js';

type BitableClient = Pick<FeishuClient, 'listRecords' | 'createRecord' | 'updateRecord' | 'getRecord'> &
  Partial<Pick<FeishuClient, 'searchRecords'>>;
type TableIds = Record<FeishuCapabilityName, string | undefined>;

const defaultTableIds: TableIds = {
  equipment: env.FEISHU_EQUIPMENT_TABLE_ID,
  telemetry: env.FEISHU_TELEMETRY_TABLE_ID,
  health: env.FEISHU_HEALTH_TABLE_ID,
  alerts: env.FEISHU_ALERT_TABLE_ID,
  workOrders: env.FEISHU_WORK_ORDER_TABLE_ID,
  spareParts: env.FEISHU_SPARE_PART_TABLE_ID,
  spareTransactions: env.FEISHU_SPARE_TRANSACTION_TABLE_ID,
  knowledge: env.FEISHU_KNOWLEDGE_TABLE_ID,
  operationLogs: env.FEISHU_OPERATION_LOG_TABLE_ID,
};

function serialize(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, Array.isArray(item) || (item && typeof item === 'object') ? JSON.stringify(item) : item]));
}

function deserialize<T>(fields: Record<string, unknown>): T {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => {
    if (typeof value !== 'string') return [key, value];
    try { return [key, JSON.parse(value)]; } catch { return [key, value]; }
  })) as T;
}

function textValue(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => typeof item === 'object' && item && 'text' in item ? String(item.text) : String(item)).join('');
  return value === undefined || value === null ? '' : String(value);
}

export function deriveWorkOrderFaultFields(faultDescription: string) {
  const headline = faultDescription.split('；', 1)[0]?.trim() || '待现场确认';
  const twinParts = headline.split('·').map((item) => item.trim()).filter(Boolean);
  if (twinParts.length >= 2) return { faultPart: twinParts[0], faultType: twinParts.slice(1).join(' · ') };
  const separator = headline.indexOf('：');
  if (separator > 0) {
    return {
      faultPart: headline.slice(0, separator).replace(/异常$/, '').trim() || '待现场确认',
      faultType: headline.slice(separator + 1).trim() || '待现场确认',
    };
  }
  return { faultPart: '待现场确认', faultType: headline };
}

/** WorkOrders 表只写入当前已确认存在的八个中文字段。日期字段使用 Unix 毫秒时间戳。 */
export function toFeishuWorkOrderFields(order: WorkOrder): Record<string, unknown> {
  const createdTime = Date.parse(order.createdAt || order.createdTime);
  if (!Number.isFinite(createdTime)) throw new AppError(400, 'INVALID_WORK_ORDER_DATE', '工单创建时间必须是可识别的 ISO 日期');
  const derived = deriveWorkOrderFaultFields(order.faultDescription);
  const faultPart = order.faultPart || derived.faultPart;
  const faultType = order.faultType || derived.faultType;
  return {
    工单编号: getWorkOrderNo(order),
    设备名称: order.deviceName,
    设备编号: order.deviceId,
    故障部位: faultPart,
    故障类型: faultType,
    风险等级: order.riskLevel,
    工单状态: order.status,
    创建时间: createdTime,
  };
}

export function fromFeishuWorkOrderFields(fields: Record<string, unknown>, fallback: Partial<WorkOrder> = {}): WorkOrder {
  const dateValue = fields.创建时间;
  const numericTimestamp = typeof dateValue === 'number' ? dateValue : Number(dateValue);
  const stringTimestamp = typeof dateValue === 'string' ? Date.parse(dateValue) : Number.NaN;
  const fallbackTimestamp = fallback.createdTime ? Date.parse(fallback.createdTime) : Number.NaN;
  const timestamp = Number.isFinite(numericTimestamp) ? numericTimestamp : Number.isFinite(stringTimestamp) ? stringTimestamp : Number.isFinite(fallbackTimestamp) ? fallbackTimestamp : Date.now();
  const createdTime = new Date(timestamp).toISOString();
  const fallbackFault = deriveWorkOrderFaultFields(fallback.faultDescription ?? '待现场确认');
  const faultPart = textValue(fields.故障部位) || fallbackFault.faultPart || '待现场确认';
  const faultType = textValue(fields.故障类型) || fallbackFault.faultType || '待现场确认';
  const workOrderNo = textValue(fields.工单编号) || getWorkOrderNo(fallback);
  return {
    maintenanceSuggestion: [], assignee: '待分配', assigneeUserId: '', createdBy: '飞书多维表格',
    requiredSpareParts: [], consumedSpareParts: [], processingRecord: [], healthScoreBefore: 0,
    ...fallback,
    id: fallback.id || workOrderNo,
    workOrderNo,
    workOrderId: workOrderNo,
    deviceName: textValue(fields.设备名称) || fallback.deviceName || '未命名设备',
    deviceId: textValue(fields.设备编号) || fallback.deviceId || 'UNKNOWN',
    faultPart,
    faultType,
    faultDescription: `${faultPart} · ${faultType}`,
    riskLevel: (textValue(fields.风险等级) || fallback.riskLevel || '关注') as WorkOrder['riskLevel'],
    status: (textValue(fields.工单状态) || fallback.status || '待接单') as WorkOrder['status'],
    createdAt: createdTime,
    createdTime,
    deadline: fallback.deadline ?? new Date(timestamp + 24 * 3_600_000).toISOString(),
  };
}

export interface FeishuBitableRepositoryOptions {
  client?: BitableClient;
  appToken?: string;
  tableIds?: Partial<TableIds>;
  capabilities?: FeishuCapabilities;
  integrationState?: FeishuIntegrationState;
}

/** 飞书真实数据适配层。每个业务模块独立判断能力，未配置的模块继续使用内置 Mock 数据。 */
export class FeishuBitableRepository extends MockRepository {
  private client: BitableClient;
  private token: string;
  private tableIds: TableIds;
  private capabilities: FeishuCapabilities;
  private integrationState?: FeishuIntegrationState;
  private recordIds = new Map<string, string>();
  private workOrderCache = new Map<string, WorkOrder>();

  constructor(options: FeishuBitableRepositoryOptions = {}) {
    super();
    this.client = options.client ?? new FeishuClient();
    this.token = options.appToken ?? env.FEISHU_BITABLE_APP_TOKEN ?? '';
    this.tableIds = { ...defaultTableIds, ...options.tableIds };
    this.capabilities = options.capabilities ?? feishuCapabilities;
    this.integrationState = options.integrationState;
  }

  private usesFeishu(module: FeishuCapabilityName) { return this.capabilities[module].mode === 'feishu'; }
  private tableId(module: FeishuCapabilityName) {
    const tableId = this.tableIds[module];
    if (!tableId) throw new AppError(500, 'FEISHU_TABLE_NOT_CONFIGURED', `飞书模块 ${module} 未配置数据表`);
    return tableId;
  }
  private recordKey(tableId: string, id: string) { return `${tableId}:${id}`; }

  private workOrderRemoteAvailable() {
    return !this.integrationState || this.integrationState.canAttemptRemote();
  }

  private markWorkOrderReadFailure(error: unknown) {
    if (!classifyFeishuIntegrationError(error)) return false;
    this.integrationState?.markFailure(error);
    return true;
  }

  private assertWorkOrderWriteAvailable() {
    if (!this.workOrderRemoteAvailable()) throw feishuWorkOrderUnavailable();
  }

  private cacheWorkOrder(order: WorkOrder) {
    const tableId = this.tableId('workOrders');
    for (const identifier of getWorkOrderIdentifiers(order)) {
      this.workOrderCache.set(identifier, order);
      if (order.recordId) this.recordIds.set(this.recordKey(tableId, identifier), order.recordId);
    }
  }

  private mapWorkOrderRecord(record: FeishuBitableRecord, expectedIdentifier?: string) {
    const fieldWorkOrderNo = textValue(record.fields.工单编号);
    if (expectedIdentifier?.startsWith('WO-') && fieldWorkOrderNo && fieldWorkOrderNo !== expectedIdentifier) {
      throw new AppError(409, 'WORK_ORDER_ID_MISMATCH', '飞书记录的“工单编号”与当前工单不一致');
    }
    const fallback = this.workOrderCache.get(record.record_id)
      ?? (expectedIdentifier ? this.workOrderCache.get(expectedIdentifier) : undefined)
      ?? (fieldWorkOrderNo ? this.workOrderCache.get(fieldWorkOrderNo) : undefined);
    const mapped = {
      ...normalizeWorkOrderIdentity(fromFeishuWorkOrderFields(record.fields, fallback)),
      recordId: record.record_id,
      syncStatus: 'synced' as const,
      syncMessage: undefined,
      syncErrorCode: undefined,
      lastSyncedAt: new Date().toISOString(),
    };
    this.cacheWorkOrder(mapped);
    return mapped;
  }

  private async getWorkOrderByRecordId(recordId: string, expectedIdentifier?: string) {
    const result = await this.client.getRecord(this.token, this.tableId('workOrders'), recordId);
    return this.mapWorkOrderRecord(result.record, expectedIdentifier);
  }

  private async findWorkOrderRecordByNo(workOrderNo: string) {
    const records = this.client.searchRecords
      ? await this.client.searchRecords(this.token, this.tableId('workOrders'), '工单编号', workOrderNo)
      : await this.client.listRecords(this.token, this.tableId('workOrders'));
    return records.find((record) => textValue(record.fields.工单编号) === workOrderNo);
  }

  private async persistLocalWorkOrder(value: WorkOrder) {
    const existing = await super.getWorkOrder(value.recordId || value.id || value.workOrderNo);
    return existing
      ? super.updateWorkOrder(existing.id, value)
      : super.createWorkOrder(value);
  }

  private async listRemote<T>(module: FeishuCapabilityName, primaryKey: string): Promise<T[]> {
    const tableId = this.tableId(module);
    const records = await this.client.listRecords(this.token, tableId);
    return records.map((record) => {
      const item = deserialize<T>(record.fields);
      this.recordIds.set(this.recordKey(tableId, String((item as Record<string, unknown>)[primaryKey])), record.record_id);
      return item;
    });
  }

  private async createRemote<T extends object>(module: FeishuCapabilityName, value: T, primaryKey: string) {
    const tableId = this.tableId(module);
    const record = value as Record<string, unknown>;
    const result = await this.client.createRecord(this.token, tableId, serialize(record));
    this.recordIds.set(this.recordKey(tableId, String(record[primaryKey])), result.record.record_id);
    return value;
  }

  private async updateRemote<T extends object>(module: FeishuCapabilityName, id: string, value: T, primaryKey: string) {
    const tableId = this.tableId(module);
    const key = this.recordKey(tableId, id);
    if (!this.recordIds.has(key)) await this.listRemote(module, primaryKey);
    const recordId = this.recordIds.get(key);
    if (recordId) await this.client.updateRecord(this.token, tableId, recordId, serialize(value as Record<string, unknown>));
    return value;
  }

  override async listEquipment() { return this.usesFeishu('equipment') ? this.listRemote<Equipment>('equipment', 'deviceId') : super.listEquipment(); }
  override async getEquipment(id: string) { return this.usesFeishu('equipment') ? (await this.listEquipment()).find((item) => item.deviceId === id) : super.getEquipment(id); }
  override async createEquipment(value: Equipment) { return this.usesFeishu('equipment') ? this.createRemote('equipment', value, 'deviceId') : super.createEquipment(value); }
  override async updateEquipment(id: string, patch: Partial<Equipment>) {
    if (!this.usesFeishu('equipment')) return super.updateEquipment(id, patch);
    const value = { ...(await this.getEquipment(id)), ...patch } as Equipment;
    return this.updateRemote('equipment', id, value, 'deviceId');
  }

  override async getTelemetry(id: string) { return this.usesFeishu('telemetry') ? (await this.listRemote<TelemetryPoint>('telemetry', 'recordKey')).filter((item) => item.deviceId === id) : super.getTelemetry(id); }
  override async setTelemetry(id: string, points: TelemetryPoint[]) {
    const point = points.at(-1);
    if (!this.usesFeishu('telemetry')) await super.setTelemetry(id, points);
    else if (point) await this.createRemote('telemetry', { ...point, recordKey: `${point.deviceId}-${point.timestamp}` }, 'recordKey');
    if (this.usesFeishu('health') && point) await this.createRemote('health', { snapshotId: `${point.deviceId}-${point.timestamp}`, deviceId: point.deviceId, timestamp: point.timestamp, healthScore: point.healthScore, riskLevel: point.riskLevel, operatingCondition: point.operatingCondition, indicatorContributions: {}, modelVersion: 'competition-rule-v1' }, 'snapshotId');
  }

  override async listAlerts() { return this.usesFeishu('alerts') ? this.listRemote<Alert>('alerts', 'alertId') : super.listAlerts(); }
  override async getAlert(id: string) { return this.usesFeishu('alerts') ? (await this.listAlerts()).find((item) => item.alertId === id) : super.getAlert(id); }
  override async updateAlert(id: string, patch: Partial<Alert>) {
    if (!this.usesFeishu('alerts')) return super.updateAlert(id, patch);
    const value = { ...(await this.getAlert(id)), ...patch } as Alert;
    return this.updateRemote('alerts', id, value, 'alertId');
  }

  override async listWorkOrders() {
    if (!this.usesFeishu('workOrders')) return super.listWorkOrders();
    if (!this.workOrderRemoteAvailable()) return super.listWorkOrders();
    try {
      const records = await this.client.listRecords(this.token, this.tableId('workOrders'));
      this.integrationState?.markAuthenticated();
      const remote = records.map((record) => this.mapWorkOrderRecord(record)).filter((order) => Boolean(order.workOrderNo));
      const local = await super.listWorkOrders();
      const merged = new Map(local.map((order) => [order.workOrderNo, order]));
      remote.forEach((order) => merged.set(order.workOrderNo, order));
      return [...merged.values()];
    } catch (error) {
      if (this.markWorkOrderReadFailure(error)) return super.listWorkOrders();
      throw error;
    }
  }
  override async getWorkOrder(identifier: string) {
    if (!this.usesFeishu('workOrders')) return super.getWorkOrder(identifier);
    if (!this.workOrderRemoteAvailable()) return super.getWorkOrder(identifier);
    const tableId = this.tableId('workOrders');
    if (isFeishuRecordId(identifier)) {
      try {
        const order = await this.getWorkOrderByRecordId(identifier);
        this.integrationState?.markAuthenticated();
        return order;
      }
      catch (error) {
        this.markWorkOrderReadFailure(error);
        const cached = this.workOrderCache.get(identifier);
        if (cached) return { ...cached, syncStatus: 'pending' as const, syncMessage: '数据同步刷新中' };
        if (this.integrationState && classifyFeishuIntegrationError(error)) return super.getWorkOrder(identifier);
        throw error;
      }
    }
    const cached = this.workOrderCache.get(identifier);
    const recordId = cached?.recordId ?? this.recordIds.get(this.recordKey(tableId, identifier));
    if (recordId) {
      try {
        const order = await this.getWorkOrderByRecordId(recordId, identifier);
        this.integrationState?.markAuthenticated();
        return order;
      }
      catch (error) {
        this.markWorkOrderReadFailure(error);
        if (cached) return { ...cached, syncStatus: 'pending' as const, syncMessage: '数据同步刷新中' };
        if (this.integrationState && classifyFeishuIntegrationError(error)) return super.getWorkOrder(identifier);
        throw error;
      }
    }
    if (identifier.startsWith('WO-')) {
      try {
        const record = await this.findWorkOrderRecordByNo(identifier);
        if (record) return this.mapWorkOrderRecord(record, identifier);
      } catch (error) {
        this.markWorkOrderReadFailure(error);
      }
    }
    return (await this.listWorkOrders()).find((item) => matchesWorkOrderIdentifier(item, identifier));
  }
  override async createWorkOrder(value: WorkOrder) {
    if (!this.usesFeishu('workOrders')) return super.createWorkOrder(value);
    const normalized = normalizeWorkOrderIdentity({ ...value, syncStatus: 'pending', syncMessage: '正在同步飞书多维表格' }) as WorkOrder;
    try {
      this.assertWorkOrderWriteAvailable();
      const existing = await this.findWorkOrderRecordByNo(normalized.workOrderNo);
      if (existing) return this.mapWorkOrderRecord(existing, normalized.workOrderNo);
      const result = await this.client.createRecord(this.token, this.tableId('workOrders'), toFeishuWorkOrderFields(normalized));
      this.integrationState?.markAuthenticated();
      this.cacheWorkOrder({ ...normalized, recordId: result.record.record_id });
      return this.mapWorkOrderRecord(result.record, normalized.workOrderNo);
    } catch (error) {
      this.markWorkOrderReadFailure(error);
      const failed = { ...normalized, syncStatus: 'failed' as const, syncMessage: '飞书同步失败，可在工单详情中重试', syncErrorCode: classifyFeishuIntegrationError(error) ?? 'FEISHU_SYNC_FAILED' };
      this.cacheWorkOrder(failed);
      return this.persistLocalWorkOrder(failed);
    }
  }
  override async updateWorkOrder(identifier: string, patch: Partial<WorkOrder>) {
    if (!this.usesFeishu('workOrders')) return super.updateWorkOrder(identifier, patch);
    const current = await this.getWorkOrder(identifier);
    if (!current) throw new AppError(404, 'WORK_ORDER_NOT_FOUND', '未找到维修工单');
    const value = normalizeWorkOrderIdentity({ ...current, ...patch, syncStatus: 'pending', syncMessage: '正在同步飞书多维表格' }) as WorkOrder;
    let recordId = current.recordId ?? (isFeishuRecordId(identifier) ? identifier : undefined);
    let updateResult;
    try {
      this.assertWorkOrderWriteAvailable();
      if (!recordId) recordId = (await this.findWorkOrderRecordByNo(value.workOrderNo))?.record_id;
      if (!recordId) {
        const created = await this.client.createRecord(this.token, this.tableId('workOrders'), toFeishuWorkOrderFields(value));
        recordId = created.record.record_id;
        updateResult = created;
      } else {
        updateResult = await this.client.updateRecord(this.token, this.tableId('workOrders'), recordId, toFeishuWorkOrderFields(value));
      }
      this.integrationState?.markAuthenticated();
    } catch (error) {
      this.markWorkOrderReadFailure(error);
      const failed = { ...value, ...(recordId ? { recordId } : {}), syncStatus: 'failed' as const, syncMessage: '飞书同步失败，可重试', syncErrorCode: classifyFeishuIntegrationError(error) ?? 'FEISHU_SYNC_FAILED' };
      this.cacheWorkOrder(failed);
      return this.persistLocalWorkOrder(failed);
    }
    const cachedValue = { ...value, recordId };
    this.cacheWorkOrder(cachedValue);
    if (updateResult?.record) return this.mapWorkOrderRecord(updateResult.record, value.workOrderNo);
    try { return await this.getWorkOrderByRecordId(recordId, value.workOrderNo); }
    catch { return { ...cachedValue, syncStatus: 'pending' as const, syncMessage: '数据同步刷新中' }; }
  }

  async resyncWorkOrder(identifier: string) {
    this.integrationState?.allowRetry();
    const current = this.workOrderCache.get(identifier) ?? await super.getWorkOrder(identifier) ?? await this.getWorkOrder(identifier);
    if (!current) throw new AppError(404, 'WORK_ORDER_NOT_FOUND', '未找到维修工单');
    return this.updateWorkOrder(current.recordId || current.id || current.workOrderNo, current);
  }

  override async listSpareParts() { return this.usesFeishu('spareParts') ? this.listRemote<SparePart>('spareParts', 'partId') : super.listSpareParts(); }
  override async getSparePart(id: string) { return this.usesFeishu('spareParts') ? (await this.listSpareParts()).find((item) => item.partId === id) : super.getSparePart(id); }
  override async updateSparePart(id: string, patch: Partial<SparePart>) {
    if (!this.usesFeishu('spareParts')) return super.updateSparePart(id, patch);
    const value = { ...(await this.getSparePart(id)), ...patch } as SparePart;
    return this.updateRemote('spareParts', id, value, 'partId');
  }

  override async listSpareTransactions() { return this.usesFeishu('spareTransactions') ? this.listRemote<SparePartTransaction>('spareTransactions', 'transactionId') : super.listSpareTransactions(); }
  override async addSpareTransaction(value: SparePartTransaction) { if (this.usesFeishu('spareTransactions')) await this.createRemote('spareTransactions', value, 'transactionId'); else await super.addSpareTransaction(value); }
  override async listKnowledge() { return this.usesFeishu('knowledge') ? this.listRemote<KnowledgeEntry>('knowledge', 'knowledgeId') : super.listKnowledge(); }
  override async addKnowledge(value: KnowledgeEntry) { return this.usesFeishu('knowledge') ? this.createRemote('knowledge', value, 'knowledgeId') : super.addKnowledge(value); }
  override async listOperationLogs(entityId?: string) { const rows = this.usesFeishu('operationLogs') ? await this.listRemote<OperationLog>('operationLogs', 'logId') : await super.listOperationLogs(); return entityId ? rows.filter((row) => row.entityId === entityId) : rows; }
  override async addOperationLog(value: OperationLog) { if (this.usesFeishu('operationLogs')) await this.createRemote('operationLogs', value, 'logId'); else await super.addOperationLog(value); }
}
