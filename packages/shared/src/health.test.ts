import { describe, expect, it } from 'vitest';
import { calculateHealthScore, calculateIndicatorDeviation, createMockData, determineRiskLevel, getConditionBaselines, getStockStatus } from './index.js';

describe('健康度比赛演示规则模型', () => {
  it('健康指标得到高分且风险为健康', () => {
    const result = calculateHealthScore({ vibration: 3.2, temperature: 66, current: 72, pressure: 0.62, speed: 1450 }, '稳定运行', '离心式风机');
    expect(result.score).toBe(100); expect(result.riskLevel).toBe('健康');
  });
  it('异常振动和温度产生可解释贡献并降低健康度', () => {
    const result = calculateHealthScore({ vibration: 6.8, temperature: 86, current: 101, pressure: 0.86, speed: 1485 }, '高负荷稳定运行', '离心式风机');
    expect(result.score).toBeLessThan(90); expect(result.contributions.vibration).toBeGreaterThan(result.contributions.speed);
  });
  it('风险等级边界正确', () => {
    expect(determineRiskLevel(95)).toBe('健康'); expect(determineRiskLevel(89)).toBe('关注');
    expect(determineRiskLevel(74)).toBe('二级预警'); expect(determineRiskLevel(59)).toBe('高风险');
  });
  it('工况切换会使用不同基准', () => {
    expect(getConditionBaselines('停机').current.target).toBe(0);
    expect(getConditionBaselines('高负荷稳定运行').current.target).toBeGreaterThan(getConditionBaselines('低负荷').current.target);
    const stableDeviation = calculateIndicatorDeviation(92, getConditionBaselines('高负荷稳定运行').current);
    const stoppedDeviation = calculateIndicatorDeviation(92, getConditionBaselines('停机').current);
    expect(stableDeviation).toBe(0); expect(stoppedDeviation).toBeGreaterThan(1);
  });
  it('低库存判断正确', () => {
    expect(getStockStatus(8, 3)).toBe('充足'); expect(getStockStatus(3, 3)).toBe('偏低'); expect(getStockStatus(0, 3)).toBe('缺货');
  });
  it('生成覆盖30天且最近6小时有连续发展趋势的可复现时序', () => {
    const first = createMockData().telemetry['IDF-001']!; const second = createMockData().telemetry['IDF-001']!;
    expect(first.length).toBeGreaterThan(350);
    expect(new Date(first.at(-1)!.timestamp).getTime() - new Date(first[0]!.timestamp).getTime()).toBeGreaterThan(29 * 86_400_000);
    expect(first.at(-1)!.vibration).toBe(6.8); expect(first.at(-1)!.temperature).toBe(86);
    expect(first.map((point) => point.vibration)).toEqual(second.map((point) => point.vibration));
  });
});
