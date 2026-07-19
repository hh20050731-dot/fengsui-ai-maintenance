import { describe, expect, it } from 'vitest';
import { RuleBasedDiagnosisProvider } from '../providers/ai-diagnosis-provider.js';
import { MockNotificationProvider } from '../providers/notification-provider.js';
import { MockRepository } from '../repositories/mock-repository.js';
import { LocalRagService } from './rag-service.js';
import { OperationsService } from './operations-service.js';
import { MaintenanceAgent } from './maintenance-agent.js';

function createAgent() {
  const repository = new MockRepository();
  const operations = new OperationsService(repository, new RuleBasedDiagnosisProvider(), new MockNotificationProvider(), { createKnowledgeCandidates: true });
  return { repository, agent: new MaintenanceAgent(repository, operations, new LocalRagService(repository)) };
}

describe('MaintenanceAgent', () => {
  it('按工具链执行并只展示摘要与引用', async () => {
    const { agent } = createAgent();
    const result = await agent.run({ deviceId: 'IDF-001', alertId: 'ALT-20260717-001', task: '研判轴承温升并准备检修', maxSteps: 10, timeoutMs: 12_000, confirmCreateWorkOrder: false, operator: '测试员' });
    expect(result.status).toBe('awaiting_confirmation');
    expect(result.steps.map((step) => step.toolName)).toEqual([
      'getEquipmentStatus', 'getTelemetryTrend', 'getActiveAlerts', 'getMaintenanceHistory', 'searchKnowledgeBase',
      'checkSparePartInventory', 'generateDiagnosis', 'createWorkOrder', 'notifyFeishu', 'createKnowledgeCandidate',
    ]);
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.workOrderId).toBeUndefined();
  });

  it('遵守最大步骤数', async () => {
    const { agent } = createAgent();
    const result = await agent.run({ deviceId: 'IDF-001', task: '有限步骤检查', maxSteps: 3, timeoutMs: 12_000, confirmCreateWorkOrder: false, operator: '测试员' });
    expect(result.steps).toHaveLength(3);
    expect(result.status).toBe('partial');
  });

  it('重复执行不会重复创建工单', async () => {
    const { agent, repository } = createAgent();
    const input = { deviceId: 'IDF-001', alertId: 'ALT-20260717-001', task: '创建检修工单', maxSteps: 10, timeoutMs: 12_000, confirmCreateWorkOrder: true, operator: '测试员' };
    const first = await agent.run(input);
    const second = await agent.run(input);
    expect(first.workOrderId).toBeTruthy();
    expect(second.workOrderId).toBe(first.workOrderId);
    expect((await repository.listWorkOrders()).filter((item) => item.sourceAlertId === input.alertId)).toHaveLength(1);
  });
});
