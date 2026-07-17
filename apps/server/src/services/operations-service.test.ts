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
