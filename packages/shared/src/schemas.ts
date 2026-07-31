import { z } from 'zod';

export const equipmentInputSchema = z.object({
  deviceName: z.string().min(2, '设备名称至少 2 个字符'),
  deviceType: z.string().min(1),
  systemArea: z.string().min(1),
  manufacturer: z.string().min(1),
  model: z.string().min(1),
  installationDate: z.string().min(1),
  runningStatus: z.enum(['运行', '停机', '检修', '离线']),
  operatingCondition: z.enum(['停机', '启动', '低负荷', '稳定运行', '高负荷稳定运行']),
  responsiblePerson: z.string().min(1),
  responsibleUserId: z.string().default('demo-user'),
  location: z.string().min(1),
});

export const acknowledgeAlertSchema = z.object({ operator: z.string().min(1).default('黄浩') });
export const createWorkOrderSchema = z.object({
  assignee: z.string().min(1).default('张工'),
  assigneeUserId: z.string().default('zhang-gong'),
  deadline: z.string().min(1).optional(),
  idempotencyKey: z.string().min(6),
  digitalTwinContext: z.object({
    equipmentName: z.string().min(1),
    equipmentId: z.string().min(1),
    faultPart: z.string().min(1),
    faultType: z.string().min(1),
    riskLevel: z.enum(['低', '中高', '高']),
    failureProbability: z.number().min(0).max(100),
    healthScore: z.number().min(0).max(100),
    temperature: z.number(),
    vibration: z.number().min(0),
    speed: z.number().min(0),
    current: z.number().min(0),
    diagnosis: z.string().min(5),
    advice: z.array(z.string().min(2)).min(1),
    createdAt: z.string().datetime(),
  }).optional(),
});
export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;
export const transitionWorkOrderSchema = z.object({
  targetStatus: z.enum(['待接单', '已接单', '检修中', '待验证', '已完成', '已关闭', '已取消']),
  operator: z.string().min(1).default('黄浩'),
  note: z.string().optional().default(''),
  inspectionResult: z.string().optional(),
  repairResult: z.string().optional(),
  consumedSpareParts: z.array(z.object({ partId: z.string(), quantity: z.number().int().positive() })).optional(),
  healthScoreAfter: z.number().min(0).max(100).optional(),
  verificationResult: z.string().optional(),
  idempotencyKey: z.string().min(6),
});
export const workOrderRecordSchema = z.object({ operator: z.string().min(1), detail: z.string().min(2) });
export const stockChangeSchema = z.object({
  partId: z.string().min(1),
  quantity: z.number().int().positive(),
  operator: z.string().min(1).default('黄浩'),
  remark: z.string().default('手工库存调整'),
  idempotencyKey: z.string().min(6),
});
export const diagnosisRequestSchema = z.object({
  deviceId: z.string().min(1).optional(),
  question: z.string().trim().min(2, '请输入至少2个字符的问题').max(200, '问题不能超过200个字符'),
});

export const ragSearchRequestSchema = z.object({
  query: z.string().trim().min(2).max(300),
  deviceType: z.string().trim().min(1).max(80).optional(),
  faultType: z.string().trim().min(1).max(80).optional(),
  riskLevel: z.enum(['正常', '关注', '预警', '严重']).optional(),
  limit: z.number().int().min(1).max(10).default(5),
});

export const ragDocumentImportSchema = z.object({
  documentId: z.string().trim().min(3).max(100).regex(/^[A-Za-z0-9_-]+$/),
  title: z.string().trim().min(2).max(160),
  sourceType: z.enum(['设备说明书', '安全操作规程', '维修记录', '工单', '故障案例', '预警规则', '检修指南']),
  sourceRef: z.string().trim().min(1).max(240),
  deviceTypes: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  faultTypes: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  riskLevels: z.array(z.enum(['正常', '关注', '预警', '严重'])).max(4).default([]),
  content: z.string().trim().min(10).max(100_000),
  updatedAt: z.string().datetime().optional(),
});

export const multimodalInspectionRequestSchema = z.object({
  deviceId: z.string().trim().min(1).max(64),
  fileName: z.string().trim().min(1).max(160),
  mediaType: z.enum(['现场照片', '仪表照片', '泄漏照片', '振动频谱截图', '温度趋势截图']),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  size: z.number().int().positive().max(8 * 1024 * 1024),
  dataUrl: z.string().startsWith('data:image/').max(12 * 1024 * 1024),
});

const inspectionImageReferenceSchema = z.string().trim().min(1).max(2048).refine(
  (value) => /^(https:\/\/|attachment:\/\/|file_token:)/u.test(value),
  '图片必须是 HTTPS 资源地址或受支持的附件引用',
);

export const createInspectionSchema = z.object({
  deviceId: z.string().trim().min(1).max(64),
  inspectorName: z.string().trim().min(1).max(80),
  inspectorUserId: z.string().trim().min(1).max(128),
  inspectionTime: z.string().datetime().optional(),
  runningStatus: z.enum(['运行', '停机', '检修', '离线']),
  vibration: z.number().min(0).max(1000),
  temperature: z.number().min(-50).max(500),
  pressure: z.number().min(0).max(100),
  current: z.number().min(0).max(100_000),
  abnormalDescription: z.string().trim().max(2000).default(''),
  imageUrls: z.array(inspectionImageReferenceSchema).max(8).default([]),
  riskLevel: z.enum(['正常', '关注', '预警', '严重']).default('正常'),
  aiSummary: z.string().trim().max(4000).default(''),
  aiRecommendManualInspection: z.boolean().default(false),
  isAbnormal: z.boolean().default(false),
  status: z.enum(['草稿', '已提交']).default('已提交'),
  source: z.enum(['miaoda', 'web', 'api', 'feishu']).default('miaoda'),
  idempotencyKey: z.string().trim().min(8).max(128),
});
export type CreateInspectionInput = z.infer<typeof createInspectionSchema>;

export const updateInspectionSchema = z.object({
  runningStatus: z.enum(['运行', '停机', '检修', '离线']).optional(),
  vibration: z.number().min(0).max(1000).optional(),
  temperature: z.number().min(-50).max(500).optional(),
  pressure: z.number().min(0).max(100).optional(),
  current: z.number().min(0).max(100_000).optional(),
  abnormalDescription: z.string().trim().max(2000).optional(),
  imageUrls: z.array(inspectionImageReferenceSchema).max(8).optional(),
  riskLevel: z.enum(['正常', '关注', '预警', '严重']).optional(),
  aiSummary: z.string().trim().max(4000).optional(),
  aiRecommendManualInspection: z.boolean().optional(),
  isAbnormal: z.boolean().optional(),
  status: z.enum(['草稿', '已提交', '已关闭']).optional(),
  idempotencyKey: z.string().trim().min(8).max(128),
});
export type UpdateInspectionInput = z.infer<typeof updateInspectionSchema>;

export const createInspectionAlertSchema = z.object({
  operator: z.string().trim().min(1).max(80),
  idempotencyKey: z.string().trim().min(8).max(128),
});

export const createInspectionWorkOrderSchema = createWorkOrderSchema.extend({
  operator: z.string().trim().min(1).max(80),
});

export const agentRunRequestSchema = z.object({
  deviceId: z.string().trim().min(1).max(64),
  alertId: z.string().trim().min(1).max(80).optional(),
  task: z.string().trim().min(2).max(240).default('执行设备风险研判与检修准备'),
  maxSteps: z.number().int().min(3).max(12).default(10),
  timeoutMs: z.number().int().min(1000).max(30_000).default(12_000),
  confirmCreateWorkOrder: z.boolean().default(false),
  operator: z.string().trim().min(1).max(40).default('黄浩'),
});

export const demoJournalEntrySchema = z.object({
  version: z.literal(1),
  method: z.enum(['POST', 'PATCH']),
  path: z.string().startsWith('/').max(180),
  body: z.unknown(),
  resultId: z.string().min(1).max(120).optional(),
});
export const demoJournalSchema = z.array(demoJournalEntrySchema).max(40);
