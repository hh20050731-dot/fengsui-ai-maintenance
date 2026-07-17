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
});
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
export const diagnosisRequestSchema = z.object({ deviceId: z.string().min(1), question: z.string().optional() });
