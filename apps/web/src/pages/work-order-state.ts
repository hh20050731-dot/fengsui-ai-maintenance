import { getWorkOrderIdentifiers, matchesWorkOrderIdentifier, normalizeWorkOrderIdentity, type WorkOrder, type WorkOrderStatus } from '@fengsui/shared';

function sameWorkOrder(left: WorkOrder, right: WorkOrder) {
  const rightIdentifiers = new Set(getWorkOrderIdentifiers(right));
  return getWorkOrderIdentifiers(left).some((identifier) => rightIdentifiers.has(identifier));
}

export function mergeUpdatedWorkOrder(workOrders: WorkOrder[] | undefined, updated: WorkOrder) {
  const normalized = normalizeWorkOrderIdentity(updated) as WorkOrder;
  if (!workOrders) return [normalized];
  const exists = workOrders.some((order) => sameWorkOrder(order, normalized));
  if (!exists) return [normalized, ...workOrders];
  return workOrders.map((order) => sameWorkOrder(order, normalized) ? normalizeWorkOrderIdentity({ ...order, ...normalized, recordId: normalized.recordId ?? order.recordId }) as WorkOrder : order);
}

export function resolveWorkOrderDetail(detail: WorkOrder | undefined, workOrders: WorkOrder[] | undefined, identifier: string | undefined) {
  const listOrder = identifier ? workOrders?.find((order) => matchesWorkOrderIdentifier(order, identifier)) : undefined;
  if (detail && listOrder) return normalizeWorkOrderIdentity({ ...listOrder, ...detail, recordId: detail.recordId ?? listOrder.recordId }) as WorkOrder;
  return detail ? normalizeWorkOrderIdentity(detail) as WorkOrder : listOrder;
}

export function workOrderTransitionMessage(updated: WorkOrder, target: WorkOrderStatus | null) {
  const action = target === '已接单' ? '接单成功' : `工单已推进为“${updated.status}”`;
  return updated.syncStatus === 'pending' ? `${action}，数据同步刷新中` : action;
}
