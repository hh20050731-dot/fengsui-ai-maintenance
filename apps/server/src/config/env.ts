import 'dotenv/config';
import { z } from 'zod';

const optionalProtectedValue = z.preprocess(
  (value) => value === '' ? undefined : value,
  z.string().min(16).optional(),
);

export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_MODE: z.enum(['mock', 'feishu']).default('mock'),
  APP_BASE_URL: z.string().url().default('http://localhost:5173'),
  PORT: z.coerce.number().default(3001),
  FEISHU_APP_ID: z.string().optional(), FEISHU_APP_SECRET: z.string().optional(),
  FEISHU_VERIFICATION_TOKEN: z.string().optional(), FEISHU_ENCRYPT_KEY: z.string().optional(),
  FEISHU_BITABLE_APP_TOKEN: z.string().optional(), FEISHU_EQUIPMENT_TABLE_ID: z.string().optional(),
  FEISHU_TELEMETRY_TABLE_ID: z.string().optional(), FEISHU_HEALTH_TABLE_ID: z.string().optional(),
  FEISHU_INSPECTION_TABLE_ID: z.string().optional(),
  FEISHU_ALERT_TABLE_ID: z.string().optional(), FEISHU_WORK_ORDER_TABLE_ID: z.string().optional(),
  FEISHU_SPARE_PART_TABLE_ID: z.string().optional(), FEISHU_SPARE_TRANSACTION_TABLE_ID: z.string().optional(),
  FEISHU_KNOWLEDGE_TABLE_ID: z.string().optional(), FEISHU_OPERATION_LOG_TABLE_ID: z.string().optional(),
  FEISHU_NOTIFICATION_CHAT_ID: z.string().optional(), FEISHU_STOCK_NOTIFICATION_CHAT_ID: z.string().optional(), AI_PROVIDER: z.string().default('rule'),
  OPENAI_API_KEY: z.string().optional(), OPENAI_MODEL: z.string().optional(),
  DOUBAO_API_KEY: z.string().optional(), DOUBAO_MODEL: z.string().optional(),
  DOUBAO_BASE_URL: z.string().url().default('https://ark.cn-beijing.volces.com/api/v3'),
  CRON_SECRET: optionalProtectedValue,
});

export const env = serverEnvSchema.parse(process.env);

export const feishuClientKeys = ['FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_BITABLE_APP_TOKEN'] as const;
export const feishuCapabilityTableKeys = {
  equipment: 'FEISHU_EQUIPMENT_TABLE_ID',
  telemetry: 'FEISHU_TELEMETRY_TABLE_ID',
  health: 'FEISHU_HEALTH_TABLE_ID',
  inspections: 'FEISHU_INSPECTION_TABLE_ID',
  alerts: 'FEISHU_ALERT_TABLE_ID',
  workOrders: 'FEISHU_WORK_ORDER_TABLE_ID',
  spareParts: 'FEISHU_SPARE_PART_TABLE_ID',
  spareTransactions: 'FEISHU_SPARE_TRANSACTION_TABLE_ID',
  knowledge: 'FEISHU_KNOWLEDGE_TABLE_ID',
  operationLogs: 'FEISHU_OPERATION_LOG_TABLE_ID',
} as const;

export type FeishuCapabilityName = keyof typeof feishuCapabilityTableKeys;
export type FeishuCapability = { mode: 'mock' | 'feishu'; configured: boolean };
export type FeishuCapabilities = Record<FeishuCapabilityName, FeishuCapability>;
type FeishuConfigKey = typeof feishuClientKeys[number] | typeof feishuCapabilityTableKeys[FeishuCapabilityName];
type FeishuConfigSource = Partial<Record<FeishuConfigKey, string | undefined>>;

export function buildFeishuCapabilities(config: FeishuConfigSource, mode: 'mock' | 'feishu'): FeishuCapabilities {
  const clientConfigured = feishuClientKeys.every((key) => Boolean(config[key]));
  return Object.fromEntries(Object.entries(feishuCapabilityTableKeys).map(([name, key]) => {
    const configured = clientConfigured && Boolean(config[key]);
    return [name, { configured, mode: mode === 'feishu' && configured ? 'feishu' : 'mock' }];
  })) as FeishuCapabilities;
}

export const missingFeishuClientConfig = feishuClientKeys.filter((key) => !env[key]);
export const feishuClientConfigured = missingFeishuClientConfig.length === 0;
export const effectiveMode: 'mock' | 'feishu' = env.APP_MODE === 'feishu' && feishuClientConfigured ? 'feishu' : 'mock';
export const feishuCapabilities = buildFeishuCapabilities(env, effectiveMode);
export const missingFeishuConfig = [
  ...missingFeishuClientConfig,
  ...Object.values(feishuCapabilityTableKeys).filter((key) => !env[key]),
];

if (env.APP_MODE === 'feishu' && env.NODE_ENV !== 'test' && process.env.FEISHU_WS !== '1') {
  if (!feishuClientConfigured) {
    console.warn(`[integration] 飞书客户端基础配置不完整，飞书能力暂不可用。缺失：${missingFeishuClientConfig.join(', ')}`);
  } else if (feishuCapabilities.workOrders.mode === 'feishu' && Object.entries(feishuCapabilities).some(([name, capability]) => name !== 'workOrders' && capability.mode === 'mock')) {
    console.info('[integration] 飞书已部分启用：维修工单使用飞书，未配置模块继续使用Mock');
  }
}
