import { describe, expect, it } from 'vitest';
import type { IntegrationStatus } from '../../contexts/AppContext';
import { getIntegrationConnectionPresentation } from './TopStatusBar';

function status(patch: Partial<IntegrationStatus>): IntegrationStatus {
  return {
    requestedMode: 'feishu', effectiveMode: 'mock', configured: true, authenticated: false,
    safeErrorCode: null, degraded: true, feishuClient: false, sso: '演示身份', bitable: '模拟数据仓库',
    robot: '卡片预览', aiProvider: 'RuleBasedDiagnosisProvider', version: '1.0.2', lastSyncAt: new Date(0).toISOString(),
    missingConfig: [], capabilities: {} as IntegrationStatus['capabilities'], ...patch,
  };
}

describe('顶部飞书集成状态', () => {
  it('凭证无效时不显示已连接', () => {
    expect(getIntegrationConnectionPresentation(status({ safeErrorCode: 'FEISHU_AUTH_INVALID' }), false))
      .toEqual({ connected: false, connectionText: '飞书凭证无效' });
  });

  it('仅在鉴权成功后显示已连接', () => {
    expect(getIntegrationConnectionPresentation(status({ effectiveMode: 'feishu', authenticated: true }), false))
      .toEqual({ connected: true, connectionText: '飞书数据已连接' });
  });
});
