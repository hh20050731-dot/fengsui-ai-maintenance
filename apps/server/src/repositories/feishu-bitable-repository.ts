import type { Alert, Equipment, KnowledgeEntry, OperationLog, SparePart, SparePartTransaction, TelemetryPoint, WorkOrder } from '@fengsui/shared';
import { env } from '../config/env.js';
import { FeishuClient } from '../providers/feishu-client.js';
import { MockRepository } from './mock-repository.js';

const ids = {
  equipment: env.FEISHU_EQUIPMENT_TABLE_ID!, telemetry: env.FEISHU_TELEMETRY_TABLE_ID!, health: env.FEISHU_HEALTH_TABLE_ID!, alerts: env.FEISHU_ALERT_TABLE_ID!,
  workOrders: env.FEISHU_WORK_ORDER_TABLE_ID!, spareParts: env.FEISHU_SPARE_PART_TABLE_ID!,
  transactions: env.FEISHU_SPARE_TRANSACTION_TABLE_ID!, knowledge: env.FEISHU_KNOWLEDGE_TABLE_ID!, logs: env.FEISHU_OPERATION_LOG_TABLE_ID!,
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

/** 飞书真实数据适配层。远端读取失败由统一错误处理返回，绝不暴露令牌。 */
export class FeishuBitableRepository extends MockRepository {
  private client = new FeishuClient();
  private token = env.FEISHU_BITABLE_APP_TOKEN!;
  private recordIds = new Map<string, string>();

  private async listRemote<T>(tableId: string, primaryKey: string): Promise<T[]> {
    const records = await this.client.listRecords(this.token, tableId);
    return records.map((record) => { const item = deserialize<T>(record.fields); this.recordIds.set(String((item as any)[primaryKey]), record.record_id); return item; });
  }
  private async createRemote<T extends Record<string, unknown>>(tableId: string, value: T, primaryKey: string) {
    const result = await this.client.createRecord(this.token, tableId, serialize(value));
    this.recordIds.set(String(value[primaryKey]), result.record.record_id); return value;
  }
  private async updateRemote<T extends Record<string, unknown>>(tableId: string, id: string, value: T, primaryKey: string) {
    if (!this.recordIds.has(id)) await this.listRemote(tableId, primaryKey);
    const recordId = this.recordIds.get(id);
    if (recordId) await this.client.updateRecord(this.token, tableId, recordId, serialize(value));
    return value;
  }

  override async listEquipment() { return this.listRemote<Equipment>(ids.equipment, 'deviceId'); }
  override async getEquipment(id: string) { return (await this.listEquipment()).find((item) => item.deviceId === id); }
  override async createEquipment(value: Equipment) { return this.createRemote(ids.equipment, value as any, 'deviceId'); }
  override async updateEquipment(id: string, patch: Partial<Equipment>) { const current = await this.getEquipment(id); const value = { ...current, ...patch } as Equipment; return this.updateRemote(ids.equipment, id, value as any, 'deviceId'); }
  override async getTelemetry(id: string) { return (await this.listRemote<TelemetryPoint>(ids.telemetry, 'timestamp')).filter((item) => item.deviceId === id); }
  override async setTelemetry(_id: string, points: TelemetryPoint[]) { for (const point of points.slice(-1)) { await this.createRemote(ids.telemetry, { ...point, recordKey: `${point.deviceId}-${point.timestamp}` } as any, 'recordKey'); await this.createRemote(ids.health, { snapshotId: `${point.deviceId}-${point.timestamp}`, deviceId: point.deviceId, timestamp: point.timestamp, healthScore: point.healthScore, riskLevel: point.riskLevel, operatingCondition: point.operatingCondition, indicatorContributions: {}, modelVersion: 'competition-rule-v1' } as any, 'snapshotId'); } }
  override async listAlerts() { return this.listRemote<Alert>(ids.alerts, 'alertId'); }
  override async getAlert(id: string) { return (await this.listAlerts()).find((item) => item.alertId === id); }
  override async updateAlert(id: string, patch: Partial<Alert>) { const value = { ...(await this.getAlert(id)), ...patch } as Alert; return this.updateRemote(ids.alerts, id, value as any, 'alertId'); }
  override async listWorkOrders() { return this.listRemote<WorkOrder>(ids.workOrders, 'workOrderId'); }
  override async getWorkOrder(id: string) { return (await this.listWorkOrders()).find((item) => item.workOrderId === id); }
  override async createWorkOrder(value: WorkOrder) { return this.createRemote(ids.workOrders, value as any, 'workOrderId'); }
  override async updateWorkOrder(id: string, patch: Partial<WorkOrder>) { const value = { ...(await this.getWorkOrder(id)), ...patch } as WorkOrder; return this.updateRemote(ids.workOrders, id, value as any, 'workOrderId'); }
  override async listSpareParts() { return this.listRemote<SparePart>(ids.spareParts, 'partId'); }
  override async getSparePart(id: string) { return (await this.listSpareParts()).find((item) => item.partId === id); }
  override async updateSparePart(id: string, patch: Partial<SparePart>) { const value = { ...(await this.getSparePart(id)), ...patch } as SparePart; return this.updateRemote(ids.spareParts, id, value as any, 'partId'); }
  override async listSpareTransactions() { return this.listRemote<SparePartTransaction>(ids.transactions, 'transactionId'); }
  override async addSpareTransaction(value: SparePartTransaction) { await this.createRemote(ids.transactions, value as any, 'transactionId'); }
  override async listKnowledge() { return this.listRemote<KnowledgeEntry>(ids.knowledge, 'knowledgeId'); }
  override async listOperationLogs(entityId?: string) { const rows = await this.listRemote<OperationLog>(ids.logs, 'logId'); return entityId ? rows.filter((row) => row.entityId === entityId) : rows; }
  override async addOperationLog(value: OperationLog) { await this.createRemote(ids.logs, value as any, 'logId'); }
}
