import { describe, expect, it } from 'vitest';
import { assertWorkOrderTransition, canTransitionWorkOrder, getNextWorkOrderActions } from './index.js';

describe('维修工单状态机', () => {
  it('允许标准正向推进和待验证退回', () => {
    expect(canTransitionWorkOrder('待接单', '已接单')).toBe(true);
    expect(canTransitionWorkOrder('已接单', '检修中')).toBe(true);
    expect(canTransitionWorkOrder('检修中', '待验证')).toBe(true);
    expect(canTransitionWorkOrder('待验证', '已完成')).toBe(true);
    expect(canTransitionWorkOrder('待验证', '检修中')).toBe(true);
  });
  it('只允许待接单取消，已完成不可修改', () => {
    expect(getNextWorkOrderActions('待接单')).toContain('已取消');
    expect(getNextWorkOrderActions('已完成')).toEqual([]);
    expect(() => assertWorkOrderTransition('已完成', '检修中')).toThrow('不允许');
  });
});
