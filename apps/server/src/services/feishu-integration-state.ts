import type { FeishuCapabilities } from '../config/env.js';
import { AppError } from '../middleware/errors.js';

export type FeishuSafeErrorCode =
  | 'FEISHU_AUTH_INVALID'
  | 'FEISHU_AUTH_UNAVAILABLE'
  | 'FEISHU_API_UNAVAILABLE';

export interface FeishuAuthenticationSnapshot {
  configured: boolean;
  authenticated: boolean;
  safeErrorCode: FeishuSafeErrorCode | null;
  checkedAt?: string;
}

export function classifyFeishuIntegrationError(error: unknown): FeishuSafeErrorCode | undefined {
  if (error instanceof AppError) {
    if (error.code === 'FEISHU_AUTH_INVALID' || error.code === 'FEISHU_TOKEN_ERROR' || error.code === 'FEISHU_APP_TOKEN_ERROR') {
      return 'FEISHU_AUTH_INVALID';
    }
    if (error.code === 'FEISHU_AUTH_UNAVAILABLE' || error.code === 'FEISHU_TOKEN_RETRY_EXHAUSTED') {
      return 'FEISHU_AUTH_UNAVAILABLE';
    }
    if (error.code === 'FEISHU_API_ERROR') {
      return /99991663|token\s+invalid/i.test(error.message)
        ? 'FEISHU_AUTH_INVALID'
        : 'FEISHU_API_UNAVAILABLE';
    }
  }
  if (error instanceof TypeError || error instanceof Error) return 'FEISHU_AUTH_UNAVAILABLE';
  return undefined;
}

export class FeishuIntegrationState {
  private authenticated = false;
  private safeErrorCode: FeishuSafeErrorCode | null = null;
  private checkedAt?: string;

  constructor(private readonly configured: boolean) {}

  markAuthenticated() {
    if (!this.configured) return;
    this.authenticated = true;
    this.safeErrorCode = null;
    this.checkedAt = new Date().toISOString();
  }

  markFailure(error: unknown) {
    if (!this.configured) return;
    this.authenticated = false;
    this.safeErrorCode = classifyFeishuIntegrationError(error) ?? 'FEISHU_API_UNAVAILABLE';
    this.checkedAt = new Date().toISOString();
  }

  canAttemptRemote() {
    return this.configured && this.safeErrorCode === null;
  }

  snapshot(): FeishuAuthenticationSnapshot {
    return {
      configured: this.configured,
      authenticated: this.configured && this.authenticated,
      safeErrorCode: this.configured ? this.safeErrorCode : null,
      ...(this.checkedAt ? { checkedAt: this.checkedAt } : {}),
    };
  }
}

export function buildRuntimeCapabilities(capabilities: FeishuCapabilities, authentication: FeishuAuthenticationSnapshot) {
  return Object.fromEntries(Object.entries(capabilities).map(([name, capability]) => {
    const authenticated = capability.mode === 'feishu' && authentication.authenticated;
    return [name, {
      ...capability,
      authenticated,
      effectiveMode: authenticated ? 'feishu' : 'mock',
      safeErrorCode: capability.mode === 'feishu' ? authentication.safeErrorCode : null,
    }];
  }));
}

export function feishuWorkOrderUnavailable(error?: unknown) {
  const safeErrorCode = error ? classifyFeishuIntegrationError(error) : undefined;
  return new AppError(
    503,
    'FEISHU_WORK_ORDER_UNAVAILABLE',
    safeErrorCode === 'FEISHU_AUTH_INVALID'
      ? '飞书凭证无效，维修工单写入已暂停；本次操作未写入 Mock'
      : '飞书工单服务暂不可用，维修工单写入已暂停；本次操作未写入 Mock',
    { safeErrorCode: safeErrorCode ?? 'FEISHU_API_UNAVAILABLE' },
  );
}
