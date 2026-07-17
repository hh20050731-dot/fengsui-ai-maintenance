import 'dotenv/config';

const base = 'https://open.feishu.cn/open-apis';
let cachedToken: { value: string; expiresAt: number } | undefined;

export function requireEnv(name: string): string {
  const value = process.env[name]; if (!value) throw new Error(`缺少环境变量 ${name}`); return value;
}

export async function token() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const response = await fetch(`${base}/auth/v3/tenant_access_token/internal`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ app_id: requireEnv('FEISHU_APP_ID'), app_secret: requireEnv('FEISHU_APP_SECRET') }) });
  const payload = await response.json() as { code: number; msg: string; tenant_access_token?: string; expire?: number };
  if (!response.ok || payload.code !== 0 || !payload.tenant_access_token) throw new Error(`获取 tenant_access_token 失败：${payload.msg || response.status}。请检查应用凭证和网络。`);
  cachedToken = { value: payload.tenant_access_token, expiresAt: Date.now() + (payload.expire ?? 7200) * 1000 }; return cachedToken.value;
}

export async function feishu<T>(path: string, init: RequestInit = {}): Promise<T> {
  const accessToken = await token();
  const response = await fetch(`${base}${path}`, { ...init, headers: { 'content-type': 'application/json; charset=utf-8', authorization: `Bearer ${accessToken}`, ...init.headers } });
  const payload = await response.json() as { code: number; msg?: string; data?: T };
  if (!response.ok || payload.code !== 0) throw new Error(`飞书接口失败（${payload.code || response.status}）：${payload.msg ?? '未知错误'}。请确认应用权限、多维表格协作者权限和数据范围。`);
  return payload.data as T;
}

export const serializeFields = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).map(([key, item]) => [key, Array.isArray(item) || (item && typeof item === 'object') ? JSON.stringify(item) : item ?? '']));
