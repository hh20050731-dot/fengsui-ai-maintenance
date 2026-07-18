import type { ApiResponse } from '@fengsui/shared';
import { clearDemoJournal, demoJournalHeaders, persistDemoMutation } from './demo-state';
import { handleOfflineApi, OfflineApiError, resetOfflineDemoState } from './offline-api';
import { runtimeConfig } from './runtime-config';
import { generateUuid } from '../utils/generateUuid';

export class ApiClientError extends Error {
  constructor(public code: string, message: string, public details?: unknown) { super(message); }
}

let effectiveServerMode: 'mock' | 'feishu' | undefined;
let transportMode: 'remote' | 'offline' = runtimeConfig.forceOfflineDemo ? 'offline' : 'remote';
let fallbackReported = false;

function reportFallback(error: unknown) {
  if (fallbackReported) return;
  fallbackReported = true;
  console.warn('[offline-demo] 后端或飞书服务不可用，已切换为浏览器本地演示数据：', error instanceof Error ? error.message : error);
}

function isTransportFailure(error: unknown) {
  return !(error instanceof ApiClientError) && !(error instanceof OfflineApiError);
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (transportMode === 'offline') return handleOfflineApi<T>(path, init);
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), runtimeConfig.apiTimeoutMs);
  try {
    const response = await fetch(`${runtimeConfig.apiBase}${path}`, {
      credentials: 'include', ...init, signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(effectiveServerMode === 'feishu' ? {} : demoJournalHeaders()),
        ...init?.headers,
      },
    });
    const responseMode = response.headers.get('x-fengsui-mode');
    if (responseMode === 'mock' || responseMode === 'feishu') effectiveServerMode = responseMode;
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('application/json')) throw new TypeError(`API 返回了非 JSON 内容（${contentType || '未知类型'}）`);
    const payload = await response.json() as ApiResponse<T>;
    if (!response.ok || !payload.success) {
      const error = payload.success ? { code: 'HTTP_ERROR', message: `请求失败（${response.status}）` } : payload.error;
      throw new ApiClientError(error.code, error.message, 'details' in error ? error.details : undefined);
    }
    if (effectiveServerMode === 'mock') persistDemoMutation(path, init, payload.data);
    return payload.data;
  } catch (error) {
    if (!runtimeConfig.allowOfflineFallback || !isTransportFailure(error)) throw error;
    transportMode = 'offline';
    effectiveServerMode = 'mock';
    reportFallback(error);
    return handleOfflineApi<T>(path, init);
  } finally {
    window.clearTimeout(timer);
  }
}

export const postJson = <T>(path: string, body: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const patchJson = <T>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
export const idempotencyKey = (prefix: string) => `${prefix}-${generateUuid()}`;

export async function resetDemoState() {
  clearDemoJournal();
  effectiveServerMode = 'mock';
  if (transportMode === 'offline') {
    resetOfflineDemoState();
    return { reset: true as const };
  }
  return api<{ reset: true }>('/demo/reset', { method: 'POST', body: '{}' });
}

export const isOfflineDemoTransport = () => transportMode === 'offline';
