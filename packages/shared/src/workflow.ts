import type { WorkOrder, WorkOrderStatus } from './types.js';

const transitions: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  待接单: ['已接单', '已取消'],
  已接单: ['检修中'],
  检修中: ['待验证'],
  待验证: ['检修中', '已完成'],
  已完成: ['已关闭'],
  已关闭: [],
  已取消: [],
};

export function canTransitionWorkOrder(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  return transitions[from].includes(to);
}

export function assertWorkOrderTransition(from: WorkOrderStatus, to: WorkOrderStatus): void {
  if (!canTransitionWorkOrder(from, to)) throw new Error(`不允许从“${from}”推进到“${to}”`);
}

export function getNextWorkOrderActions(status: WorkOrderStatus): WorkOrderStatus[] { return transitions[status]; }

export function isFeishuRecordId(identifier: string): boolean {
  return /^rec[a-zA-Z0-9_-]{3,}$/.test(identifier);
}

export function getWorkOrderNo(order: Partial<WorkOrder>): string {
  return order.workOrderNo || order.workOrderId || order.id || '';
}

export function getWorkOrderIdentifiers(order: Partial<WorkOrder>): string[] {
  return [...new Set([order.recordId, order.id, order.workOrderNo, order.workOrderId].filter((value): value is string => Boolean(value)))];
}

export function matchesWorkOrderIdentifier(order: Partial<WorkOrder>, identifier: string): boolean {
  return Boolean(identifier) && getWorkOrderIdentifiers(order).includes(identifier);
}

/** 状态更新优先使用飞书 record_id，其次使用内部稳定 id 和工单编号。 */
export function getWorkOrderTransitionIdentifier(order: Partial<WorkOrder>): string {
  return order.recordId || order.id || order.workOrderNo || order.workOrderId || '';
}

export function normalizeWorkOrderIdentity<T extends Partial<WorkOrder>>(order: T): T & Pick<WorkOrder, 'id' | 'workOrderNo' | 'workOrderId' | 'createdAt'> {
  const workOrderNo = getWorkOrderNo(order);
  const createdAt = order.createdAt || order.createdTime || new Date().toISOString();
  return { ...order, id: order.id || workOrderNo, workOrderNo, workOrderId: workOrderNo, createdAt };
}
