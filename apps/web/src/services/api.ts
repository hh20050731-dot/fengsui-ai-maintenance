import type { ApiResponse } from '@fengsui/shared';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || '/api';

export class ApiClientError extends Error { constructor(public code: string, message: string, public details?: unknown) { super(message); } }

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include', ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  const payload = await response.json() as ApiResponse<T>;
  if (!response.ok || !payload.success) {
    const error = payload.success ? { code: 'HTTP_ERROR', message: `请求失败（${response.status}）` } : payload.error;
    throw new ApiClientError(error.code, error.message, 'details' in error ? error.details : undefined);
  }
  return payload.data;
}

export const postJson = <T>(path: string, body: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const patchJson = <T>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
export const idempotencyKey = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
