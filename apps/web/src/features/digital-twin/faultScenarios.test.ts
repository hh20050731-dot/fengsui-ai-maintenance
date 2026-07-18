import { describe, expect, it } from 'vitest';
import { canCreateWorkOrderForScenario, faultScenarioFromAlertIndicators, faultScenarios } from './faultScenarios';

describe('数字孪生故障场景', () => {
  it('四种场景的指标、趋势和研判结果保持同步', () => {
    expect(Object.keys(faultScenarios)).toHaveLength(4);
    expect(faultScenarios['bearing-overheat'].sensors.temperature).toBe(82);
    expect(faultScenarios['bearing-overheat'].trends.at(-1)?.temperature).toBe(82);
    expect(faultScenarios['impeller-imbalance'].sensors.vibration).toBe(7.4);
    expect(faultScenarios['coupling-misalignment'].diagnosis).toContain('疑似轴系不对中');
    expect(faultScenarios.normal.probability).toBe(4);
  });

  it('根据预警指标选择匹配的3D故障场景', () => {
    expect(faultScenarioFromAlertIndicators(['轴承振动', '轴承温度'])).toBe('bearing-overheat');
    expect(faultScenarioFromAlertIndicators(['联轴器对中'])).toBe('coupling-misalignment');
    expect(faultScenarioFromAlertIndicators(['叶轮不平衡'])).toBe('impeller-imbalance');
  });

  it('正常场景不开放工单操作，故障场景保留原有工单入口', () => {
    expect(canCreateWorkOrderForScenario('normal')).toBe(false);
    expect(canCreateWorkOrderForScenario('bearing-overheat')).toBe(true);
    expect(canCreateWorkOrderForScenario('impeller-imbalance')).toBe(true);
    expect(canCreateWorkOrderForScenario('coupling-misalignment')).toBe(true);
  });
});
