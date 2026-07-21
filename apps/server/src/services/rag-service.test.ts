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

  it('导入文档后完成切分、过滤并返回章节与关联来源', async () => {
    const service = new LocalRagService(new MockRepository());
    const imported = service.importDocument({
      documentId: 'DOC-LOCAL-MANUAL', title: '引风机维护说明', sourceType: '设备说明书', sourceRef: 'manual:local-demo',
      deviceTypes: ['引风机'], faultTypes: ['轴承温升'], riskLevels: ['预警'],
      content: '轴承温升时应先确认工况和温度传感器。检查润滑油状态、轴承间隙和冷却条件。',
    });
    expect(imported.chunkCount).toBe(2);
    const result = await service.search({ query: '引风机轴承温升润滑检查', deviceType: '引风机', faultType: '轴承温升' });
    expect(result.citations).toEqual(expect.arrayContaining([expect.objectContaining({ documentId: 'DOC-LOCAL-MANUAL', section: expect.stringMatching(/^第/), sourceRef: 'manual:local-demo' })]));
  });
});
