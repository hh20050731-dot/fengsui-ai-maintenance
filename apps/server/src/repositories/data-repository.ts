import type {
  Alert, Equipment, InspectionRecord, KnowledgeEntry, OperationLog, SparePart, SparePartTransaction, TelemetryPoint, WorkOrder,
} from '@fengsui/shared';

export interface DataRepository {
  listEquipment(): Promise<Equipment[]>;
  getEquipment(id: string): Promise<Equipment | undefined>;
  createEquipment(input: Equipment): Promise<Equipment>;
  updateEquipment(id: string, patch: Partial<Equipment>): Promise<Equipment>;
  getTelemetry(id: string): Promise<TelemetryPoint[]>;
  setTelemetry(id: string, points: TelemetryPoint[]): Promise<void>;
  listAlerts(): Promise<Alert[]>;
  getAlert(id: string): Promise<Alert | undefined>;
  createAlert(alert: Alert): Promise<Alert>;
  updateAlert(id: string, patch: Partial<Alert>): Promise<Alert>;
  listInspections(): Promise<InspectionRecord[]>;
  getInspection(id: string): Promise<InspectionRecord | undefined>;
  createInspection(inspection: InspectionRecord): Promise<InspectionRecord>;
  updateInspection(id: string, patch: Partial<InspectionRecord>): Promise<InspectionRecord>;
  listWorkOrders(): Promise<WorkOrder[]>;
  getWorkOrder(id: string): Promise<WorkOrder | undefined>;
  createWorkOrder(order: WorkOrder): Promise<WorkOrder>;
  updateWorkOrder(id: string, patch: Partial<WorkOrder>): Promise<WorkOrder>;
  resyncWorkOrder?(id: string): Promise<WorkOrder>;
  listSpareParts(): Promise<SparePart[]>;
  getSparePart(id: string): Promise<SparePart | undefined>;
  updateSparePart(id: string, patch: Partial<SparePart>): Promise<SparePart>;
  listSpareTransactions(): Promise<SparePartTransaction[]>;
  addSpareTransaction(transaction: SparePartTransaction): Promise<void>;
  listKnowledge(): Promise<KnowledgeEntry[]>;
  addKnowledge?(entry: KnowledgeEntry): Promise<KnowledgeEntry>;
  listOperationLogs(entityId?: string): Promise<OperationLog[]>;
  addOperationLog(log: OperationLog): Promise<void>;
}
