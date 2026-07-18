import type { Alert, Equipment, KnowledgeEntry, OperationLog, SparePart, SparePartTransaction, TelemetryPoint, WorkOrder } from '@fengsui/shared';
import { env, feishuCapabilities, type FeishuCapabilities, type FeishuCapabilityName } from '../config/env.js';
import { AppError } from '../middleware/errors.js';
import { FeishuClient, type FeishuBitableRecord } from '../providers/feishu-client.js';
import { MockRepository } from './mock-repository.js';

type BitableClient = Pick<FeishuClient, 'listRecords' | 'createRecord' | 'updateRecord' | 'getRecord'>;
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
  const createdTime = Date.parse(order.createdTime);
  if (!Number.isFinite(createdTime)) throw new AppError(400, 'INVALID_WORK_ORDER_DATE', '工单创建时间必须是可识别的 ISO 日期');
  const { faultPart, faultType } = deriveWorkOrderFaultFields(order.faultDescription);
  return {
    工单编号: order.workOrderId,
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
  const faultPart = textValue(fields.故障部位) || fallbackFault.faultPart;
  const faultType = textValue(fields.故障类型) || fallbackFault.faultType;
  return {
    maintenanceSuggestion: [], assignee: '待分配', assigneeUserId: '', createdBy: '飞书多维表格',
    requiredSpareParts: [], consumedSpareParts: [], processingRecord: [], healthScoreBefore: 0,
    ...fallback,
    workOrderId: textValue(fields.工单编号) || fallback.workOrderId || '',
    deviceName: textValue(fields.设备名称) || fallback.deviceName || '未命名设备',
    deviceId: textValue(fields.设备编号) || fallback.deviceId || 'UNKNOWN',
    faultDescription: `${faultPart} · ${faultType}`,
    riskLevel: (textValue(fields.风险等级) || fallback.riskLevel || '关注') as WorkOrder['riskLevel'],
    status: (textValue(fields.工单状态) || fallback.status || '待接单') as WorkOrder['status'],
    createdTime,
    deadline: fallback.deadline ?? new Date(timestamp + 24 * 3_600_000).toISOString(),
  };
}

export interface FeishuBitableRepositoryOptions {
  client?: BitableClient;
  appToken?: string;
  tableIds?: Partial<TableIds>;
  capabilities?: FeishuCapabilities;
}

/** 飞书真实数据适配层。每个业务模块独立判断能力，未配置的模块继续使用内置 Mock 数据。 */
export class FeishuBitableRepository extends MockRepository {
  private client: BitableClient;
  private token: string;
  private tableIds: TableIds;
  private capabilities: FeishuCapabilities;
  private recordIds = new Map<string, string>();
  private workOrderCache = new Map<string, WorkOrder>();

  constructor(options: FeishuBitableRepositoryOptions = {}) {
    super();
    this.client = options.client ?? new FeishuClient();
    this.token = options.appToken ?? env.FEISHU_BITABLE_APP_TOKEN ?? '';
    this.tableIds = { ...defaultTableIds, ...options.tableIds };
    this.capabilities = options.capabilities ?? feishuCapabilities;
  }

  private usesFeishu(module: FeishuCapabilityName) { return this.capabilities[module].mode === 'feishu'; }
  private tableId(module: FeishuCapabilityName) {
    const tableId = this.tableIds[module];
    if (!tableId) throw new AppError(500, 'FEISHU_TABLE_NOT_CONFIGURED', `飞书模块 ${module} 未配置数据表`);
    return tableId;
  }
  private recordKey(tableId: string, id: string) { return `${tableId}:${id}`; }

  private mapWorkOrderRecord(record: FeishuBitableRecord, expectedWorkOrderId?: string) {
    const tableId = this.tableId('workOrders');
    const fieldWorkOrderId = textValue(record.fields.工单编号);
    if (expectedWorkOrderId && fieldWorkOrderId && fieldWorkOrderId !== expectedWorkOrderId) {
      throw new AppError(409, 'WORK_ORDER_ID_MISMATCH', '飞书记录的“工单编号”与当前工单不一致');
    }
    const workOrderId = fieldWorkOrderId || expectedWorkOrderId || '';
    const fallback = workOrderId ? this.workOrderCache.get(workOrderId) : undefined;
    const mapped = { ...fromFeishuWorkOrderFields(record.fields, { ...fallback, workOrderId }), syncStatus: 'synced' as const, syncMessage: undefined };
    if (mapped.workOrderId) {
      this.recordIds.set(this.recordKey(tableId, mapped.workOrderId), record.record_id);
      this.workOrderCache.set(mapped.workOrderId, mapped);
    }
    return mapped;
  }

  private async getWorkOrderByRecordId(workOrderId: string, recordId: string) {
    const result = await this.client.getRecord(this.token, this.tableId('workOrders'), recordId);
    return { ...this.mapWorkOrderRecord(result.record, workOrderId), syncStatus: 'synced' as const, syncMessage: undefined };
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
    const records = await this.client.listRecords(this.token, this.tableId('workOrders'));
    return records.map((record) => this.mapWorkOrderRecord(record)).filter((order) => Boolean(order.workOrderId));
  }
  override async getWorkOrder(id: string) {
    if (!this.usesFeishu('workOrders')) return super.getWorkOrder(id);
    const tableId = this.tableId('workOrders');
    const recordId = this.recordIds.get(this.recordKey(tableId, id));
    if (recordId) {
      try { return await this.getWorkOrderByRecordId(id, recordId); }
      catch (error) {
        const cached = this.workOrderCache.get(id);
        if (cached) return { ...cached, syncStatus: 'pending' as const, syncMessage: '数据同步刷新中' };
        throw error;
      }
    }
    return (await this.listWorkOrders()).find((item) => item.workOrderId === id);
  }
  override async createWorkOrder(value: WorkOrder) {
    if (!this.usesFeishu('workOrders')) return super.createWorkOrder(value);
    const tableId = this.tableId('workOrders');
    const result = await this.client.createRecord(this.token, tableId, toFeishuWorkOrderFields(value));
    this.recordIds.set(this.recordKey(tableId, value.workOrderId), result.record.record_id);
    this.workOrderCache.set(value.workOrderId, value);
    return value;
  }
  override async updateWorkOrder(id: string, patch: Partial<WorkOrder>) {
    if (!this.usesFeishu('workOrders')) return super.updateWorkOrder(id, patch);
    const current = await this.getWorkOrder(id);
    if (!current) throw new AppError(404, 'WORK_ORDER_NOT_FOUND', '未找到维修工单');
    const value = { ...current, ...patch };
    const tableId = this.tableId('workOrders');
    const key = this.recordKey(tableId, id);
    const recordId = this.recordIds.get(key);
    if (!recordId) throw new AppError(404, 'WORK_ORDER_RECORD_NOT_FOUND', '未找到维修工单对应的飞书记录');
    const updateResult = await this.client.updateRecord(this.token, tableId, recordId, toFeishuWorkOrderFields(value));
    this.workOrderCache.set(id, value);
    if (updateResult?.record) return { ...this.mapWorkOrderRecord(updateResult.record, id), syncStatus: 'synced' as const, syncMessage: undefined };
    try { return await this.getWorkOrderByRecordId(id, recordId); }
    catch { return { ...value, syncStatus: 'pending' as const, syncMessage: '数据同步刷新中' }; }
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
