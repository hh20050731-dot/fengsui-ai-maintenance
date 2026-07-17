import { describe, expect, it } from 'vitest';
import { MockRepository } from '../repositories/mock-repository.js';
import { RuleBasedDiagnosisProvider } from '../providers/ai-diagnosis-provider.js';
import { MockNotificationProvider } from '../providers/notification-provider.js';
import { OperationsService } from './operations-service.js';

describe('库存扣减与幂等控制', () => {
  it('相同幂等键重复出库只扣减一次', async () => {
    const repository = new MockRepository(); const service = new OperationsService(repository, new RuleBasedDiagnosisProvider(), new MockNotificationProvider());
    const before = (await repository.getSparePart('SP-001'))!.currentStock;
    const input = { partId: 'SP-001', quantity: 1, operator: '测试员', remark: '测试出库', idempotencyKey: 'idem-stock-001' };
    await service.stockChange('出库', input); await service.stockChange('出库', input);
    expect((await repository.getSparePart('SP-001'))!.currentStock).toBe(before - 1);
    expect((await repository.listSpareTransactions()).filter((item) => item.idempotencyKey === input.idempotencyKey)).toHaveLength(1);
  });
  it('库存不足时拒绝扣减', async () => {
    const repository = new MockRepository(); const service = new OperationsService(repository, new RuleBasedDiagnosisProvider(), new MockNotificationProvider());
    await expect(service.stockChange('出库', { partId: 'SP-004', quantity: 1, operator: '测试员', remark: '测试', idempotencyKey: 'idem-stock-empty' })).rejects.toThrow('库存不足');
  });
});

describe('数字孪生工单上下文', () => {
  it('复用预警链路创建包含场景指标的待接单工单', async () => {
    const repository = new MockRepository(); const service = new OperationsService(repository, new RuleBasedDiagnosisProvider(), new MockNotificationProvider());
    const order = await service.createWorkOrderFromAlert('ALT-20260717-001', {
      assignee: '张工', assigneeUserId: 'zhang-gong', idempotencyKey: 'digital-twin-test-001',
      digitalTwinContext: {
        equipmentName: '1号引风机', equipmentId: 'IDF-001', faultPart: '驱动端轴承', faultType: '轴承温升', riskLevel: '高',
        failureProbability: 89, healthScore: 42, temperature: 82, vibration: 5.2, speed: 1472, current: 41,
        diagnosis: '驱动端轴承存在润滑不足、磨损或冷却异常风险', advice: ['24小时内检查润滑和轴承游隙'], createdAt: '2026-07-17T14:00:00.000Z',
      },
    });
    expect(order.status).toBe('待接单');
    expect(order.riskLevel).toBe('高风险');
    expect(order.healthScoreBefore).toBe(42);
    expect(order.faultDescription).toContain('温度 82℃');
    expect(order.faultDescription).toContain('故障概率 89%');
    expect(order.requiredSpareParts.map((part) => part.partName)).toEqual(['风机轴承', '通用润滑油']);
  });
});
