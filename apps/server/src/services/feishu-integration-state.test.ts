import { describe, expect, it } from 'vitest';
import { buildFeishuCapabilities } from '../config/env.js';
import { AppError } from '../middleware/errors.js';
import { buildRuntimeCapabilities, FeishuIntegrationState } from './feishu-integration-state.js';

const capabilities = buildFeishuCapabilities({
  FEISHU_APP_ID: 'configured-app-id',
  FEISHU_APP_SECRET: 'configured-app-secret',
  FEISHU_BITABLE_APP_TOKEN: 'configured-app-token',
  FEISHU_WORK_ORDER_TABLE_ID: 'configured-work-order-table',
}, 'feishu');

describe('飞书鉴权安全降级状态', () => {
  it('区分已配置、已鉴权和模块实际生效模式', () => {
    const state = new FeishuIntegrationState(true);
    expect(state.snapshot()).toMatchObject({ configured: true, authenticated: false, safeErrorCode: null });

    state.markAuthenticated();
    const runtime = buildRuntimeCapabilities(capabilities, state.snapshot());
    expect(runtime.workOrders).toMatchObject({ configured: true, authenticated: true, effectiveMode: 'feishu' });
    expect(runtime.equipment).toMatchObject({ configured: false, authenticated: false, effectiveMode: 'mock' });
  });

  it('凭证无效时只暴露安全错误码并降级工单能力', () => {
    const state = new FeishuIntegrationState(true);
    state.markFailure(new AppError(502, 'FEISHU_AUTH_INVALID', '飞书应用凭证无效'));
    const snapshot = state.snapshot();
    const runtime = buildRuntimeCapabilities(capabilities, snapshot);

    expect(snapshot).toMatchObject({ configured: true, authenticated: false, safeErrorCode: 'FEISHU_AUTH_INVALID' });
    expect(runtime.workOrders).toMatchObject({ configured: true, authenticated: false, effectiveMode: 'mock', safeErrorCode: 'FEISHU_AUTH_INVALID' });
    expect(JSON.stringify(snapshot)).not.toContain('configured-app-secret');
  });
});
