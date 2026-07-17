import type { Contributions, Equipment, IndicatorKey, OperatingCondition, RiskLevel } from './types.js';

export interface IndicatorBaseline { target: number; tolerance: number; critical: number }
export type Baselines = Record<IndicatorKey, IndicatorBaseline>;

const conditionBaselines: Record<OperatingCondition, Baselines> = {
  停机: {
    vibration: { target: 0.1, tolerance: 0.3, critical: 1 }, temperature: { target: 28, tolerance: 8, critical: 18 },
    current: { target: 0, tolerance: 2, critical: 8 }, pressure: { target: 0, tolerance: 0.1, critical: 0.4 }, speed: { target: 0, tolerance: 20, critical: 100 },
  },
  启动: {
    vibration: { target: 3.8, tolerance: 2.4, critical: 5 }, temperature: { target: 58, tolerance: 18, critical: 30 },
    current: { target: 95, tolerance: 35, critical: 70 }, pressure: { target: 0.55, tolerance: 0.28, critical: 0.6 }, speed: { target: 1050, tolerance: 450, critical: 850 },
  },
  低负荷: {
    vibration: { target: 2.7, tolerance: 1.3, critical: 3.5 }, temperature: { target: 58, tolerance: 12, critical: 24 },
    current: { target: 48, tolerance: 18, critical: 42 }, pressure: { target: 0.42, tolerance: 0.16, critical: 0.36 }, speed: { target: 980, tolerance: 220, critical: 500 },
  },
  稳定运行: {
    vibration: { target: 3.2, tolerance: 1.4, critical: 3.2 }, temperature: { target: 66, tolerance: 12, critical: 22 },
    current: { target: 72, tolerance: 18, critical: 38 }, pressure: { target: 0.62, tolerance: 0.16, critical: 0.34 }, speed: { target: 1450, tolerance: 140, critical: 380 },
  },
  高负荷稳定运行: {
    vibration: { target: 4.0, tolerance: 1.5, critical: 3 }, temperature: { target: 73, tolerance: 12, critical: 20 },
    current: { target: 92, tolerance: 18, critical: 38 }, pressure: { target: 0.78, tolerance: 0.18, critical: 0.36 }, speed: { target: 1480, tolerance: 110, critical: 300 },
  },
};

const defaultWeights: Record<IndicatorKey, number> = { vibration: 0.3, temperature: 0.22, current: 0.18, pressure: 0.15, speed: 0.15 };
const typeWeights: Record<string, Record<IndicatorKey, number>> = {
  风机: { vibration: 0.34, temperature: 0.26, current: 0.18, pressure: 0.1, speed: 0.12 },
  水泵: { vibration: 0.25, temperature: 0.18, current: 0.17, pressure: 0.27, speed: 0.13 },
  发电机: { vibration: 0.25, temperature: 0.28, current: 0.28, pressure: 0.04, speed: 0.15 },
  减速机: { vibration: 0.35, temperature: 0.3, current: 0.12, pressure: 0.08, speed: 0.15 },
};

export function getConditionBaselines(condition: OperatingCondition): Baselines { return conditionBaselines[condition]; }

export function calculateIndicatorDeviation(value: number, baseline: IndicatorBaseline): number {
  const excess = Math.max(0, Math.abs(value - baseline.target) - baseline.tolerance);
  return Math.min(1.5, excess / Math.max(0.01, baseline.critical));
}

export function calculateContributions(
  metrics: Pick<Equipment, IndicatorKey>, condition: OperatingCondition, deviceType: string,
): Contributions {
  const baselines = getConditionBaselines(condition);
  const weights = Object.entries(typeWeights).find(([key]) => deviceType.includes(key))?.[1] ?? defaultWeights;
  return (Object.keys(weights) as IndicatorKey[]).reduce((result, key) => {
    result[key] = Number((calculateIndicatorDeviation(metrics[key], baselines[key]) * weights[key] * 100).toFixed(1));
    return result;
  }, {} as Contributions);
}

export function determineRiskLevel(score: number, criticalExceeded = false): RiskLevel {
  if (score < 60 || (criticalExceeded && score < 75)) return '高风险';
  if (score < 75 || criticalExceeded) return '二级预警';
  if (score < 90) return '关注';
  return '健康';
}

/** 当前为比赛演示规则模型，后续可替换为真实异常检测、时序预测或故障诊断模型。 */
export function calculateHealthScore(
  metrics: Pick<Equipment, IndicatorKey>, condition: OperatingCondition, deviceType: string,
): { score: number; riskLevel: RiskLevel; contributions: Contributions } {
  const contributions = calculateContributions(metrics, condition, deviceType);
  const penalty = Object.values(contributions).reduce((sum, value) => sum + value, 0);
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty * 1.35)));
  const baselines = getConditionBaselines(condition);
  const criticalExceeded = (Object.keys(baselines) as IndicatorKey[]).some(
    (key) => Math.abs(metrics[key] - baselines[key].target) > baselines[key].tolerance + baselines[key].critical,
  );
  return { score, riskLevel: determineRiskLevel(score, criticalExceeded), contributions };
}

export function getStockStatus(currentStock: number, safeStock: number): '充足' | '偏低' | '缺货' {
  if (currentStock <= 0) return '缺货';
  return currentStock <= safeStock ? '偏低' : '充足';
}
