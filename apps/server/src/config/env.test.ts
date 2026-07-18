import { describe, expect, it } from 'vitest';
import { buildFeishuCapabilities } from './env.js';

describe('飞书模块能力配置', () => {
  it('只配置工单表时仅启用维修工单能力', () => {
    const capabilities = buildFeishuCapabilities({
      FEISHU_APP_ID: 'configured-app-id',
      FEISHU_APP_SECRET: 'configured-app-secret',
      FEISHU_BITABLE_APP_TOKEN: 'configured-app-token',
      FEISHU_WORK_ORDER_TABLE_ID: 'configured-work-order-table',
    }, 'feishu');

    expect(capabilities.workOrders).toEqual({ configured: true, mode: 'feishu' });
    expect(capabilities.equipment).toEqual({ configured: false, mode: 'mock' });
    expect(capabilities.telemetry).toEqual({ configured: false, mode: 'mock' });
    expect(capabilities.health).toEqual({ configured: false, mode: 'mock' });
    expect(capabilities.alerts).toEqual({ configured: false, mode: 'mock' });
    expect(capabilities.spareParts).toEqual({ configured: false, mode: 'mock' });
  });

  it('缺少客户端基础配置时工单表也不能单独启用', () => {
    const capabilities = buildFeishuCapabilities({ FEISHU_WORK_ORDER_TABLE_ID: 'configured-work-order-table' }, 'feishu');
    expect(capabilities.workOrders).toEqual({ configured: false, mode: 'mock' });
  });
});
