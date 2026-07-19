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
  const method = (init?.method ?? 'GET').toUpperCase();
  const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  const isDiagnosisRequest = method === 'POST' && path === '/ai/diagnose';
  const isFeishuWorkOrderWrite = isWrite
    && /^\/work-orders(?:\/|$)/.test(path)
    && (effectiveServerMode === 'feishu' || runtimeConfig.requestedMode === 'feishu');
  if (transportMode === 'offline') {
    if (isFeishuWorkOrderWrite) {
      throw new ApiClientError('FEISHU_WRITE_UNAVAILABLE', '当前无法连接飞书工单服务，请恢复连接并刷新工单后重试；该操作未写入Mock');
    }
    return handleOfflineApi<T>(path, init);
  }
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), isWrite ? runtimeConfig.apiWriteTimeoutMs : runtimeConfig.apiReadTimeoutMs);
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
    if (isFeishuWorkOrderWrite && isTransportFailure(error)) {
      throw new ApiClientError('FEISHU_WRITE_STATUS_UNKNOWN', '飞书写入请求未在限定时间内返回，请刷新工单列表确认状态，系统不会将该写操作重放到Mock');
    }
    if (isDiagnosisRequest && isTransportFailure(error)) {
      throw new ApiClientError('AI_DIAGNOSIS_UNAVAILABLE', '辅助研判服务暂不可用，系统未返回固定模板；请检查服务连接后重试');
    }
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
