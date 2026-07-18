import type { WorkOrder, WorkOrderStatus } from '@fengsui/shared';

export function mergeUpdatedWorkOrder(workOrders: WorkOrder[] | undefined, updated: WorkOrder) {
  if (!workOrders) return [updated];
  const exists = workOrders.some((order) => order.workOrderId === updated.workOrderId);
  if (!exists) return [updated, ...workOrders];
  return workOrders.map((order) => order.workOrderId === updated.workOrderId ? { ...order, ...updated } : order);
}

export function resolveWorkOrderDetail(detail: WorkOrder | undefined, workOrders: WorkOrder[] | undefined, workOrderId: string | undefined) {
  return detail ?? workOrders?.find((order) => order.workOrderId === workOrderId);
}

export function workOrderTransitionMessage(updated: WorkOrder, target: WorkOrderStatus | null) {
  const action = target === '已接单' ? '接单成功' : `工单已推进为“${updated.status}”`;
  return updated.syncStatus === 'pending' ? `${action}，数据同步刷新中` : action;
}
