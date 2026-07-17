import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_MODE: z.enum(['mock', 'feishu']).default('mock'),
  APP_BASE_URL: z.string().url().default('http://localhost:5173'),
  PORT: z.coerce.number().default(3001),
  FEISHU_APP_ID: z.string().optional(), FEISHU_APP_SECRET: z.string().optional(),
  FEISHU_VERIFICATION_TOKEN: z.string().optional(), FEISHU_ENCRYPT_KEY: z.string().optional(),
  FEISHU_BITABLE_APP_TOKEN: z.string().optional(), FEISHU_EQUIPMENT_TABLE_ID: z.string().optional(),
  FEISHU_TELEMETRY_TABLE_ID: z.string().optional(), FEISHU_HEALTH_TABLE_ID: z.string().optional(),
  FEISHU_ALERT_TABLE_ID: z.string().optional(), FEISHU_WORK_ORDER_TABLE_ID: z.string().optional(),
  FEISHU_SPARE_PART_TABLE_ID: z.string().optional(), FEISHU_SPARE_TRANSACTION_TABLE_ID: z.string().optional(),
  FEISHU_KNOWLEDGE_TABLE_ID: z.string().optional(), FEISHU_OPERATION_LOG_TABLE_ID: z.string().optional(),
  FEISHU_NOTIFICATION_CHAT_ID: z.string().optional(), AI_PROVIDER: z.string().default('rule'),
  OPENAI_API_KEY: z.string().optional(), OPENAI_MODEL: z.string().optional(),
});

export const env = schema.parse(process.env);

export const requiredFeishuKeys = [
  'FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_BITABLE_APP_TOKEN', 'FEISHU_EQUIPMENT_TABLE_ID',
  'FEISHU_TELEMETRY_TABLE_ID', 'FEISHU_HEALTH_TABLE_ID', 'FEISHU_ALERT_TABLE_ID', 'FEISHU_WORK_ORDER_TABLE_ID',
  'FEISHU_SPARE_PART_TABLE_ID', 'FEISHU_SPARE_TRANSACTION_TABLE_ID', 'FEISHU_KNOWLEDGE_TABLE_ID',
  'FEISHU_OPERATION_LOG_TABLE_ID',
] as const;

export const missingFeishuConfig = requiredFeishuKeys.filter((key) => !env[key]);
export const effectiveMode: 'mock' | 'feishu' = env.APP_MODE === 'feishu' && missingFeishuConfig.length === 0 ? 'feishu' : 'mock';

if (env.APP_MODE === 'feishu' && effectiveMode === 'mock' && env.NODE_ENV !== 'test') {
  console.warn(`[integration] 飞书配置不完整，已安全降级为 Mock 模式。缺失：${missingFeishuConfig.join(', ')}`);
}
