import { describe, expect, it } from 'vitest';
import { createMockData, formatIndicatorTrend, recognizeDiagnosisIntent } from '@fengsui/shared';
import { RuleBasedDiagnosisProvider } from './ai-diagnosis-provider.js';

describe('规则驱动辅助研判', () => {
  it('真实使用问题意图并引用1号引风机趋势与知识库', async () => {
    const data = createMockData();
    const device = data.equipment.find((item) => item.deviceId === 'IDF-001')!;
    const question = '为什么判断1号引风机存在轴承温升风险？';
    const result = await new RuleBasedDiagnosisProvider().diagnose({
      question,
      intent: recognizeDiagnosisIntent(question),
      selectedDeviceId: 'IDF-002',
      device,
      equipment: data.equipment,
      telemetry: data.telemetry['IDF-001']!,
      knowledge: data.knowledge,
      alerts: data.alerts,
    });
    expect(result.question).toBe(question);
    expect(result.intent).toBe('diagnosis_reason');
    expect(result.deviceId).toBe('IDF-001');
    expect(result.trendEvidence.join('')).toMatch(/由 4\.[12] mm\/s 上升至 6\.8 mm\/s/);
    expect(result.trendEvidence.join('')).toContain('6.8 mm/s');
    expect(result.trendEvidence.join('')).toContain('72℃');
    expect(result.trendEvidence.join('')).toContain('86℃');
    expect(result.suspectedCauses.join('')).toContain('轴承磨损');
    expect(result.relatedSpareParts).toContain('风机轴承');
    expect(result.riskNotice).toContain('是否停机应由现场负责人');
  });

  it('维修后指标下降时使用正确趋势方向和绝对变化量', async () => {
    const data = createMockData();
    const original = data.equipment.find((item) => item.deviceId === 'IDF-001')!;
    const device = { ...original, vibration: 3.1, temperature: 68, healthScore: 92, riskLevel: '健康' as const };
    const now = Date.now();
    const telemetry = [
      { ...data.telemetry['IDF-001']![0]!, timestamp: new Date(now - 6 * 3_600_000).toISOString(), vibration: 4.2, temperature: 72 },
      { ...data.telemetry['IDF-001']!.at(-1)!, timestamp: new Date(now).toISOString(), vibration: 3.1, temperature: 68 },
    ];
    const question = '1号引风机当前状态如何？';
    const result = await new RuleBasedDiagnosisProvider().diagnose({
      question,
      intent: recognizeDiagnosisIntent(question),
      device,
      telemetry,
      knowledge: data.knowledge,
      alerts: data.alerts.map((item) => item.deviceId === 'IDF-001' ? { ...item, alertStatus: '已关闭' as const } : item),
    });
    expect(result.trendEvidence).toContain('过去6小时振动值由 4.2 mm/s 下降至 3.1 mm/s（下降 1.1 mm/s）');
    expect(result.trendEvidence).toContain('过去6小时轴承温度由 72℃ 下降至 68℃（下降 4℃）');
  });

  it('趋势工具覆盖上升、下降和基本稳定三种方向', () => {
    expect(formatIndicatorTrend('振动值', 4.2, 3.1, 'mm/s', 1)).toContain('下降 1.1 mm/s');
    expect(formatIndicatorTrend('温度', 72, 68, '℃', 0)).toContain('下降 4℃');
    expect(formatIndicatorTrend('振动值', 3.1, 4.2, 'mm/s', 1)).toContain('上升 1.1 mm/s');
    expect(formatIndicatorTrend('温度', 68, 72, '℃', 0)).toContain('上升 4℃');
    expect(formatIndicatorTrend('温度', 68, 68, '℃', 0)).toContain('基本稳定');
  });
});
