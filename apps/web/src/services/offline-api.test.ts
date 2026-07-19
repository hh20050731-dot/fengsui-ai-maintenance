import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiDiagnosis, Alert, Equipment, KnowledgeEntry, RagSearchResult, SparePart, WorkOrder } from '@fengsui/shared';

function installLocalStorage() {
  const values = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
}

const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) } satisfies RequestInit);

describe('浏览器离线演示数据适配器', () => {
  beforeEach(() => { vi.resetModules(); vi.unstubAllGlobals(); installLocalStorage(); });

  it('页面模块重新加载后保留已生成工单', async () => {
    const first = await import('./offline-api');
    first.resetOfflineDemoState();
    const order = await first.handleOfflineApi<WorkOrder>('/alerts/ALT-20260717-001/create-work-order', post({ assignee: '张工', assigneeUserId: 'zhang-gong', idempotencyKey: 'offline-create-1' }));
    vi.resetModules();
    const reloaded = await import('./offline-api');
    const persisted = await reloaded.handleOfflineApi<WorkOrder>(`/work-orders/${order.workOrderId}`);
    expect(persisted.status).toBe('待接单');
    expect(persisted.sourceAlertId).toBe('ALT-20260717-001');
  });

  it('完成闭环后只扣减一次库存并更新设备、预警和知识候选', async () => {
    const offline = await import('./offline-api');
    offline.resetOfflineDemoState();
    const order = await offline.handleOfflineApi<WorkOrder>('/alerts/ALT-20260717-001/create-work-order', post({ assignee: '张工', assigneeUserId: 'zhang-gong', idempotencyKey: 'offline-flow-create' }));
    const transition = (targetStatus: string, extra: Record<string, unknown> = {}) => offline.handleOfflineApi<WorkOrder>(`/work-orders/${order.workOrderId}/transition`, post({ targetStatus, operator: '黄浩', note: '离线测试', idempotencyKey: `offline-${targetStatus}`, ...extra }));
    await transition('已接单');
    await transition('检修中');
    await transition('待验证', { inspectionResult: '轴承润滑不足', repairResult: '更换轴承并补充润滑', consumedSpareParts: [{ partId: 'SP-001', quantity: 1 }] });
    await transition('已完成', { healthScoreAfter: 92, verificationResult: '维修后指标恢复正常' });
    await offline.handleOfflineApi<WorkOrder>(`/work-orders/${order.workOrderId}/transition`, post({ targetStatus: '已完成', operator: '黄浩', note: '重复完成', healthScoreAfter: 92, verificationResult: '重复验证', idempotencyKey: 'offline-complete-again' }));

    const device = await offline.handleOfflineApi<Equipment>('/equipment/IDF-001');
    const alert = await offline.handleOfflineApi<Alert>('/alerts/ALT-20260717-001');
    const parts = await offline.handleOfflineApi<SparePart[]>('/spare-parts');
    const knowledge = await offline.handleOfflineApi<KnowledgeEntry[]>('/knowledge');
    expect(device.healthScore).toBe(92);
    expect(device.riskLevel).toBe('健康');
    expect(alert.alertStatus).toBe('已关闭');
    expect(parts.find((item) => item.partId === 'SP-001')?.currentStock).toBe(5);
    expect(knowledge.some((item) => item.knowledgeId === `KB-CANDIDATE-${order.workOrderId}`)).toBe(true);
  });

  it('重置后恢复初始健康度、预警、工单和库存', async () => {
    const offline = await import('./offline-api');
    offline.resetOfflineDemoState();
    await offline.handleOfflineApi<WorkOrder>('/alerts/ALT-20260717-001/create-work-order', post({ assignee: '张工', assigneeUserId: 'zhang-gong', idempotencyKey: 'offline-reset-create' }));
    await offline.handleOfflineApi<{ reset: true }>('/demo/reset', post({}));
    const device = await offline.handleOfflineApi<Equipment>('/equipment/IDF-001');
    const alert = await offline.handleOfflineApi<Alert>('/alerts/ALT-20260717-001');
    const orders = await offline.handleOfflineApi<WorkOrder[]>('/work-orders');
    const parts = await offline.handleOfflineApi<SparePart[]>('/spare-parts');
    expect(device.healthScore).toBe(68);
    expect(alert.alertStatus).toBe('待确认');
    expect(alert.relatedWorkOrderId).toBeUndefined();
    expect(orders).toHaveLength(3);
    expect(parts.find((item) => item.partId === 'SP-001')?.currentStock).toBe(6);
  });

  it('离线辅助研判也使用问题意图而不是固定模板', async () => {
    const offline = await import('./offline-api');
    offline.resetOfflineDemoState();
    const highest = await offline.handleOfflineApi<AiDiagnosis>('/ai/diagnose', post({ deviceId: 'IDF-001', question: '当前风险最高的设备是什么？' }));
    const inventory = await offline.handleOfflineApi<AiDiagnosis>('/ai/diagnose', post({ deviceId: 'IDF-001', question: '当前备件库存是否满足维修需求？' }));
    expect(highest.intent).toBe('highest_risk_equipment');
    expect(inventory.intent).toBe('spare_part_availability');
    expect(highest.riskJudgment).not.toBe(inventory.riskJudgment);
  });

  it('连续中文问题能够召回可追溯RAG证据', async () => {
    const offline = await import('./offline-api');
    offline.resetOfflineDemoState();
    const result = await offline.handleOfflineApi<RagSearchResult>('/rag/search', post({
      query: '为什么判断1号引风机存在轴承温升风险？',
      limit: 5,
    }));
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.citations[0]?.sourceRef).toMatch(/^(knowledge|fault-case):/);
    expect(result.citations[0]?.excerpt).not.toBe('');
  });
});
