export type RiskLevel = '健康' | '关注' | '二级预警' | '高风险' | '离线';
export type OperatingCondition = '停机' | '启动' | '低负荷' | '稳定运行' | '高负荷稳定运行';
export type RunningStatus = '运行' | '停机' | '检修' | '离线';
export type AlertStatus = '待确认' | '已确认' | '已生成工单' | '处理中' | '已关闭' | '误报';
export type WorkOrderStatus = '待接单' | '已接单' | '检修中' | '待验证' | '已完成' | '已取消';
export type StockStatus = '充足' | '偏低' | '缺货';

export interface User {
  id: string;
  name: string;
  role: string;
  avatar?: string;
  source: 'demo' | 'feishu';
}

export interface Equipment {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  systemArea: string;
  manufacturer: string;
  model: string;
  installationDate: string;
  runningStatus: RunningStatus;
  operatingCondition: OperatingCondition;
  healthScore: number;
  riskLevel: RiskLevel;
  vibration: number;
  temperature: number;
  current: number;
  pressure: number;
  speed: number;
  runningHours: number;
  lastMaintenanceDate: string;
  nextMaintenanceDate: string;
  responsiblePerson: string;
  responsibleUserId: string;
  location: string;
  dataSource: '模拟数据' | '飞书多维表格';
  updatedAt: string;
}

export interface TelemetryPoint {
  timestamp: string;
  deviceId: string;
  operatingCondition: OperatingCondition;
  vibration: number;
  temperature: number;
  current: number;
  pressure: number;
  speed: number;
  healthScore: number;
  riskLevel: RiskLevel;
}

export type IndicatorKey = 'vibration' | 'temperature' | 'current' | 'pressure' | 'speed';
export type Contributions = Record<IndicatorKey, number>;

export interface Alert {
  alertId: string;
  deviceId: string;
  deviceName: string;
  alertTime: string;
  riskLevel: RiskLevel;
  healthScore: number;
  operatingCondition: OperatingCondition;
  abnormalIndicators: string[];
  indicatorContributions: Contributions;
  suspectedCause: string;
  aiAnalysis: string;
  maintenanceSuggestion: string[];
  suggestedDeadline: string;
  alertStatus: AlertStatus;
  confidence: number;
  source: string;
  relatedWorkOrderId?: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  closedAt?: string;
}

export interface SparePartUsage {
  partId: string;
  partName: string;
  quantity: number;
  unit: string;
}

export interface ProcessingRecord {
  id: string;
  time: string;
  operator: string;
  action: string;
  detail: string;
}

export interface WorkOrder {
  /** 前端与 API 内部使用的稳定标识。 */
  id: string;
  /** 用户可见的工单编号，例如 WO-20260718-001。 */
  workOrderNo: string;
  /** 飞书多维表格 record_id，仅飞书模式存在。 */
  recordId?: string;
  /** @deprecated 兼容既有业务代码；值始终与 workOrderNo 一致。 */
  workOrderId: string;
  sourceAlertId?: string;
  deviceId: string;
  deviceName: string;
  riskLevel: RiskLevel;
  faultPart: string;
  faultType: string;
  faultDescription: string;
  maintenanceSuggestion: string[];
  assignee: string;
  assigneeUserId: string;
  createdBy: string;
  /** 统一的新字段名；值始终与 createdTime 一致。 */
  createdAt: string;
  createdTime: string;
  deadline: string;
  requiredSpareParts: SparePartUsage[];
  consumedSpareParts: SparePartUsage[];
  processingRecord: ProcessingRecord[];
  inspectionResult?: string;
  repairResult?: string;
  healthScoreBefore: number;
  healthScoreAfter?: number;
  status: WorkOrderStatus;
  completedAt?: string;
  verificationResult?: string;
  completionIdempotencyKey?: string;
  syncStatus?: 'synced' | 'pending';
  syncMessage?: string;
}

export interface SparePart {
  partId: string;
  partName: string;
  partCategory: string;
  applicableEquipment: string[];
  currentStock: number;
  safeStock: number;
  unit: string;
  storageLocation: string;
  supplier: string;
  lastInboundDate: string;
  lastOutboundDate?: string;
  stockStatus: StockStatus;
  unitCost: number;
  remark: string;
}

export interface SparePartTransaction {
  transactionId: string;
  partId: string;
  type: '入库' | '出库';
  quantity: number;
  time: string;
  operator: string;
  relatedWorkOrderId?: string;
  remark: string;
  idempotencyKey?: string;
}

export interface KnowledgeEntry {
  knowledgeId: string;
  title: string;
  deviceType: string;
  faultPhenomenon: string;
  abnormalIndicators: string[];
  possibleCauses: string[];
  inspectionSteps: string[];
  handlingMethod: string[];
  applicableCondition: string;
  safetyReminder: string;
  relatedSpareParts: string[];
  source: string;
  updatedAt: string;
}

export interface OperationLog {
  logId: string;
  entityType: string;
  entityId: string;
  action: string;
  operator: string;
  detail: string;
  timestamp: string;
}

export interface AiDiagnosis {
  deviceId: string;
  question: string;
  intent: DiagnosisIntent;
  riskJudgment: string;
  operatingCondition: string;
  abnormalIndicators: string[];
  trendEvidence: string[];
  suspectedCauses: string[];
  inspectionItems: string[];
  suggestedDeadline: string;
  relatedSpareParts: string[];
  confidence: number;
  riskNotice: string;
  generatedAt: string;
  provider: string;
}

export type DiagnosisIntent =
  | 'highest_risk_equipment'
  | 'high_risk_equipment_list'
  | 'equipment_status'
  | 'abnormal_metrics'
  | 'pending_work_orders'
  | 'spare_part_availability'
  | 'maintenance_priority'
  | 'diagnosis_reason'
  | 'repeated_alerts'
  | 'unsupported_or_ambiguous';

export interface DashboardData {
  statistics: {
    total: number;
    healthy: number;
    attention: number;
    warning: number;
    highRisk: number;
    todayAlerts: number;
    pendingOrders: number;
    lowStock: number;
  };
  equipment: Equipment[];
  recentAlerts: Alert[];
  pendingWorkOrders: WorkOrder[];
  healthTrend: Array<{ time: string; health: number }>;
  abnormalDistribution: Array<{ name: string; value: number }>;
  areaDistribution: Array<{ area: string; healthy: number; risk: number }>;
}

export interface DemoJournalEntry {
  version: 1;
  method: 'POST' | 'PATCH';
  path: string;
  body: unknown;
  resultId?: string;
}

export interface ApiSuccess<T> { success: true; data: T; meta?: Record<string, unknown> }
export interface ApiFailure { success: false; error: { code: string; message: string; details?: unknown } }
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
