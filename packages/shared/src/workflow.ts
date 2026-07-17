import type { WorkOrderStatus } from './types.js';

const transitions: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  待接单: ['已接单', '已取消'],
  已接单: ['检修中'],
  检修中: ['待验证'],
  待验证: ['检修中', '已完成'],
  已完成: [],
  已取消: [],
};

export function canTransitionWorkOrder(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  return transitions[from].includes(to);
}

export function assertWorkOrderTransition(from: WorkOrderStatus, to: WorkOrderStatus): void {
  if (!canTransitionWorkOrder(from, to)) throw new Error(`不允许从“${from}”推进到“${to}”`);
}

export function getNextWorkOrderActions(status: WorkOrderStatus): WorkOrderStatus[] { return transitions[status]; }
