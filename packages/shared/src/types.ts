export type RiskLevel = '健康' | '关注' | '二级预警' | '高风险' | '离线';
export type OperatingCondition = '停机' | '启动' | '低负荷' | '稳定运行' | '高负荷稳定运行';
export type RunningStatus = '运行' | '停机' | '检修' | '离线';
export type AlertStatus = '待确认' | '已确认' | '已生成工单' | '处理中' | '已关闭' | '误报';
export type WorkOrderStatus = '待接单' | '已接单' | '检修中' | '待验证' | '已完成' | '已关闭' | '已取消';
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
  /** Mock 最终成品数据始终提供；飞书旧表未扩字段时允许缺省并由服务层安全补齐。 */
  trend24h?: number[];
  trend7d?: number[];
  trend30d?: number[];
  riskContributions?: RiskContribution[];
  recentAlertIds?: string[];
  historicalWorkOrderIds?: string[];
  maintenanceRecordIds?: string[];
  recommendedMaintenanceAt?: string;
  modelType?: string;
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
  /** 乐观并发与卡片业务幂等使用；每次有效状态变更后递增。 */
  version?: number;
  source?: 'alert' | 'digital-twin' | 'feishu' | 'mock' | 'manual';
  syncStatus?: 'synced' | 'pending' | 'failed';
  syncMessage?: string;
  syncErrorCode?: string;
  lastSyncedAt?: string;
  notificationStatus?: 'not_requested' | 'pending' | 'sent' | 'failed';
  notificationMessage?: string;
  feishuMessageId?: string;
  knowledgeCandidateCreatedAt?: string;
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
  | 'CREATE_DEMO_WORK_ORDER'
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

/** 比赛最终成品使用的统一领域类型。现有业务类型保持兼容，新增能力均通过这些结构传递。 */
export type Telemetry = TelemetryPoint;
export type CompetitionRiskLevel = '正常' | '关注' | '预警' | '严重';

export interface RiskContribution {
  indicator: IndicatorKey | 'flow' | 'lubrication' | 'seal' | 'other';
  label: string;
  score: number;
  evidence: string;
}

export interface HealthAssessment {
  assessmentId: string;
  deviceId: string;
  operatingCondition: OperatingCondition;
  baselineVersion: string;
  healthScore: number;
  riskLevel: CompetitionRiskLevel;
  trendRate: number;
  sustainedMinutes: number;
  contributions: RiskContribution[];
  assessedAt: string;
  modelBoundary: string;
}

export interface RagDocument {
  documentId: string;
  title: string;
  sourceType: '设备说明书' | '安全操作规程' | '维修记录' | '工单' | '故障案例' | '预警规则' | '检修指南';
  sourceRef: string;
  deviceTypes: string[];
  faultTypes: string[];
  riskLevels: CompetitionRiskLevel[];
  content: string;
  updatedAt: string;
}

export interface RagChunk {
  chunkId: string;
  documentId: string;
  section: string;
  text: string;
  tokens: string[];
  deviceTypes: string[];
  faultTypes: string[];
  riskLevels: CompetitionRiskLevel[];
}

export interface RagCitation {
  citationId: string;
  documentId: string;
  chunkId: string;
  title: string;
  section: string;
  sourceRef: string;
  excerpt: string;
  relevance: number;
}

export interface RagSearchRequest {
  query: string;
  deviceType?: string;
  faultType?: string;
  riskLevel?: CompetitionRiskLevel;
  limit?: number;
}

export interface RagSearchResult {
  query: string;
  citations: RagCitation[];
  matchedDocumentCount: number;
  degraded: boolean;
  message: string;
}

export interface DiagnosisResult {
  diagnosisId: string;
  deviceId: string;
  alertId?: string;
  summary: string;
  evidence: string[];
  multiParameterAnalysis: string[];
  possibleCauses: string[];
  confidenceSupport: string;
  riskLevel: CompetitionRiskLevel;
  inspectionSteps: string[];
  recommendedActions: string[];
  recommendedDeadline: string;
  requiredParts: string[];
  createWorkOrder: boolean;
  citations: RagCitation[];
  limitations: string[];
  provider: string;
  generatedAt: string;
}

export type AgentStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface AgentStep {
  stepId: string;
  toolName: string;
  status: AgentStepStatus;
  inputSummary: string;
  outputSummary: string;
  startedAt: string;
  completedAt?: string;
  citationIds: string[];
  errorCode?: string;
}

export interface AgentRun {
  agentRunId: string;
  task: string;
  deviceId: string;
  alertId?: string;
  diagnosisId?: string;
  workOrderId?: string;
  status: 'running' | 'completed' | 'partial' | 'failed' | 'awaiting_confirmation';
  steps: AgentStep[];
  citations: RagCitation[];
  riskConclusion: string;
  startedAt: string;
  completedAt?: string;
  maxSteps: number;
  requiresHumanConfirmation: boolean;
}

export interface MaintenanceRecord {
  maintenanceRecordId: string;
  deviceId: string;
  workOrderId: string;
  inspectionResult: string;
  repairResult: string;
  healthScoreBefore: number;
  healthScoreAfter: number;
  consumedSparePartIds: string[];
  completedAt: string;
}

export interface KnowledgeCase {
  knowledgeCaseId: string;
  deviceId: string;
  alertId?: string;
  diagnosisId?: string;
  agentRunId?: string;
  workOrderId?: string;
  title: string;
  symptom: string;
  cause: string;
  action: string;
  result: string;
  source: '演示故障案例' | '维修闭环候选' | '人工审核';
  createdAt: string;
}

export interface IntegrationCapabilityStatus {
  mode: 'mock' | 'feishu' | 'local';
  configured: boolean;
  authenticated?: boolean;
  safeErrorCode?: string;
}

export interface IntegrationStatus {
  requestedMode: 'mock' | 'feishu';
  effectiveMode: 'mock' | 'feishu' | 'partial';
  feishuClient: boolean;
  capabilities: Record<string, IntegrationCapabilityStatus>;
  aiProvider: {
    provider: 'doubao' | 'rule-based';
    configured: boolean;
    available: boolean;
  };
}

export interface MultimodalInspection {
  inspectionId: string;
  deviceId: string;
  fileName: string;
  mediaType: '现场照片' | '仪表照片' | '泄漏照片' | '振动频谱截图' | '温度趋势截图';
  mimeType: string;
  size: number;
  observationSummary: string;
  suspiciousRegions: string[];
  telemetryCorrelation: string[];
  ragCitations: RagCitation[];
  riskLevel: CompetitionRiskLevel;
  manualInspectionTargets: string[];
  recommendWorkOrder: boolean;
  limitations: string[];
  provider: string;
  createdAt: string;
}
