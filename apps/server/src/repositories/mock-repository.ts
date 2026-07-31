import { createMockData, matchesWorkOrderIdentifier, normalizeWorkOrderIdentity, type Alert, type Equipment, type InspectionRecord, type KnowledgeEntry, type OperationLog, type SparePart, type SparePartTransaction, type TelemetryPoint, type WorkOrder } from '@fengsui/shared';
import { AppError } from '../middleware/errors.js';
import type { DataRepository } from './data-repository.js';

export class MockRepository implements DataRepository {
  protected data = createMockData();
  reset() { this.data = createMockData(); }
  async listEquipment() { return this.data.equipment; }
  async getEquipment(id: string) { return this.data.equipment.find((item) => item.deviceId === id); }
  async createEquipment(input: Equipment) { this.data.equipment.push(input); this.data.telemetry[input.deviceId] = []; return input; }
  async updateEquipment(id: string, patch: Partial<Equipment>) { return this.update('equipment', 'deviceId', id, patch); }
  async getTelemetry(id: string) { return this.data.telemetry[id] ?? []; }
  async setTelemetry(id: string, points: TelemetryPoint[]) { this.data.telemetry[id] = points; }
  async listAlerts() { return this.data.alerts; }
  async getAlert(id: string) { return this.data.alerts.find((item) => item.alertId === id); }
  async createAlert(input: Alert) {
    const existing = await this.getAlert(input.alertId);
    if (existing) return existing;
    this.data.alerts.unshift(input);
    return input;
  }
  async updateAlert(id: string, patch: Partial<Alert>) { return this.update('alerts', 'alertId', id, patch); }
  async listInspections() { return this.data.inspections; }
  async getInspection(id: string) { return this.data.inspections.find((item) => item.inspectionId === id); }
  async createInspection(input: InspectionRecord) {
    const existing = this.data.inspections.find((item) => (
      item.inspectionId === input.inspectionId
      || item.idempotencyKey === input.idempotencyKey
    ));
    if (existing) return existing;
    this.data.inspections.unshift(input);
    return input;
  }
  async updateInspection(id: string, patch: Partial<InspectionRecord>) {
    const index = this.data.inspections.findIndex((item) => item.inspectionId === id);
    if (index < 0) throw new AppError(404, 'INSPECTION_NOT_FOUND', `未找到巡检记录：${id}`);
    const updated: InspectionRecord = { ...this.data.inspections[index]!, ...patch };
    this.data.inspections[index] = updated;
    return updated;
  }
  async listWorkOrders() { return this.data.workOrders; }
  async getWorkOrder(identifier: string) { return this.data.workOrders.find((item) => matchesWorkOrderIdentifier(item, identifier)); }
  async createWorkOrder(input: WorkOrder) { const normalized = normalizeWorkOrderIdentity(input) as WorkOrder; this.data.workOrders.unshift(normalized); return normalized; }
  async updateWorkOrder(identifier: string, patch: Partial<WorkOrder>) {
    const index = this.data.workOrders.findIndex((item) => matchesWorkOrderIdentifier(item, identifier));
    if (index < 0) throw new AppError(404, 'WORK_ORDER_NOT_FOUND', `未找到维修工单：${identifier}`);
    const updated = normalizeWorkOrderIdentity({ ...this.data.workOrders[index]!, ...patch }) as WorkOrder;
    this.data.workOrders[index] = updated;
    return updated;
  }
  async listSpareParts() { return this.data.spareParts; }
  async getSparePart(id: string) { return this.data.spareParts.find((item) => item.partId === id); }
  async updateSparePart(id: string, patch: Partial<SparePart>) { return this.update('spareParts', 'partId', id, patch); }
  async listSpareTransactions() { return this.data.spareTransactions; }
  async addSpareTransaction(input: SparePartTransaction) { this.data.spareTransactions.unshift(input); }
  async listKnowledge() { return this.data.knowledge; }
  async addKnowledge(input: KnowledgeEntry) {
    const index = this.data.knowledge.findIndex((item) => item.knowledgeId === input.knowledgeId);
    if (index >= 0) this.data.knowledge[index] = input;
    else this.data.knowledge.unshift(input);
    return input;
  }
  async listOperationLogs(entityId?: string) { return entityId ? this.data.operationLogs.filter((item) => item.entityId === entityId) : this.data.operationLogs; }
  async addOperationLog(input: OperationLog) { this.data.operationLogs.unshift(input); }

  private async update<K extends 'equipment' | 'alerts' | 'workOrders' | 'spareParts'>(collection: K, key: string, id: string, patch: Record<string, unknown>) {
    const rows = this.data[collection] as any[];
    const index = rows.findIndex((row) => row[key] === id);
    if (index < 0) throw new AppError(404, 'NOT_FOUND', `未找到记录：${id}`);
    rows[index] = { ...rows[index], ...patch };
    return rows[index] as any;
  }
}
