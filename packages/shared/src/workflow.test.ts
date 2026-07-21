import { describe, expect, it } from 'vitest';
import { assertWorkOrderTransition, canTransitionWorkOrder, getNextWorkOrderActions, getWorkOrderTransitionIdentifier } from './index.js';

describe('维修工单状态机', () => {
  it('允许标准正向推进和待验证退回', () => {
    expect(canTransitionWorkOrder('待接单', '已接单')).toBe(true);
    expect(canTransitionWorkOrder('已接单', '检修中')).toBe(true);
    expect(canTransitionWorkOrder('检修中', '待验证')).toBe(true);
    expect(canTransitionWorkOrder('待验证', '已完成')).toBe(true);
    expect(canTransitionWorkOrder('待验证', '检修中')).toBe(true);
  });
  it('只允许待接单取消，已完成仅允许关闭', () => {
    expect(getNextWorkOrderActions('待接单')).toContain('已取消');
    expect(getNextWorkOrderActions('已完成')).toEqual(['已关闭']);
    expect(getNextWorkOrderActions('已关闭')).toEqual([]);
    expect(() => assertWorkOrderTransition('已完成', '检修中')).toThrow('不允许');
  });
  it('状态更新标识优先使用飞书 recordId', () => {
    expect(getWorkOrderTransitionIdentifier({ id: 'internal-001', workOrderNo: 'WO-001', workOrderId: 'WO-001', recordId: 'rec-001' })).toBe('rec-001');
    expect(getWorkOrderTransitionIdentifier({ id: 'internal-001', workOrderNo: 'WO-001', workOrderId: 'WO-001' })).toBe('internal-001');
  });
});
