import { createMockData } from '@fengsui/shared';
import { describe, expect, it } from 'vitest';
import { mergeUpdatedWorkOrder, resolveWorkOrderDetail, workOrderTransitionMessage } from './work-order-state.js';

describe('工单状态更新后的前端映射', () => {
  const original = { ...createMockData().workOrders[0]!, workOrderId: 'WO-20260718-001', status: '待接单' as const };
  const accepted = { ...original, status: '已接单' as const };

  it('立即把列表中的工单状态更新为已接单', () => {
    expect(mergeUpdatedWorkOrder([original], accepted)[0]?.status).toBe('已接单');
  });

  it('详情请求短暂失败时使用列表中的已更新工单而不是显示未找到', () => {
    expect(resolveWorkOrderDetail(undefined, [accepted], accepted.workOrderId)).toEqual(accepted);
  });

  it('接单成功使用明确提示，回读失败时提示同步刷新中', () => {
    expect(workOrderTransitionMessage(accepted, '已接单')).toBe('接单成功');
    expect(workOrderTransitionMessage({ ...accepted, syncStatus: 'pending' }, '已接单')).toBe('接单成功，数据同步刷新中');
  });
});
