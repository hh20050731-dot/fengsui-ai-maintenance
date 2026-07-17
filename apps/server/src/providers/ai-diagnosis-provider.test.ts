import { describe, expect, it } from 'vitest';
import { createMockData } from '@fengsui/shared';
import { RuleBasedDiagnosisProvider } from './ai-diagnosis-provider.js';

describe('规则驱动 AI 诊断', () => {
  it('引用1号引风机的具体6小时趋势并检索知识库', async () => {
    const data = createMockData(); const device = data.equipment.find((item) => item.deviceId === 'IDF-001')!;
    const result = await new RuleBasedDiagnosisProvider().diagnose({ device, telemetry: data.telemetry['IDF-001']!, knowledge: data.knowledge });
    expect(result.trendEvidence.join('')).toContain('4.2 mm/s'); expect(result.trendEvidence.join('')).toContain('6.8 mm/s');
    expect(result.trendEvidence.join('')).toContain('72℃'); expect(result.trendEvidence.join('')).toContain('86℃');
    expect(result.suspectedCauses).toContain('轴承磨损'); expect(result.relatedSpareParts).toContain('风机轴承');
    expect(result.riskNotice).toContain('是否停机应由现场负责人');
  });
});
