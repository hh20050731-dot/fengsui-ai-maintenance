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
  targetStatus: z.enum(['待接单', '已接单', '检修中', '待验证', '已完成', '已取消']),
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

export const multimodalInspectionRequestSchema = z.object({
  deviceId: z.string().trim().min(1).max(64),
  fileName: z.string().trim().min(1).max(160),
  mediaType: z.enum(['现场照片', '仪表照片', '泄漏照片', '振动频谱截图', '温度趋势截图']),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  size: z.number().int().positive().max(8 * 1024 * 1024),
  dataUrl: z.string().startsWith('data:image/').max(12 * 1024 * 1024),
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
