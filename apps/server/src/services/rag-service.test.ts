import { describe, expect, it } from 'vitest';
import { MockRepository } from '../repositories/mock-repository.js';
import { LocalRagService } from './rag-service.js';

describe('LocalRagService', () => {
  it('召回轴承温升的可追溯证据', async () => {
    const result = await new LocalRagService(new MockRepository()).search({ query: '1号引风机轴承过热为什么发生', deviceType: '引风机', faultType: '轴承过热', limit: 4 });
    expect(result.degraded).toBe(false);
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.citations[0]?.title).toContain('轴承');
    expect(result.citations[0]?.sourceRef).toBeTruthy();
    expect(result.citations[0]?.excerpt).toBeTruthy();
  });

  it('不相关问题不把故障案例强行排到首位', async () => {
    const result = await new LocalRagService(new MockRepository()).search({ query: '办公楼空调采购预算' });
    expect(result.citations).toHaveLength(0);
  });

  it('数据源失败时安全降级且不伪造引用', async () => {
    const repository = new MockRepository();
    repository.listKnowledge = async () => { throw new Error('database unavailable'); };
    const result = await new LocalRagService(repository).search({ query: '轴承温升' });
    expect(result.degraded).toBe(true);
    expect(result.citations).toEqual([]);
    expect(result.message).toContain('未生成虚构引用');
  });
});
