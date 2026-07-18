import type { FaultScenario, FaultScenarioId, TwinSensorSnapshot, TwinTrendPoint } from './digitalTwinTypes';
import { digitalTwinTheme } from './digitalTwinTheme';

const labels = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '当前'];

function buildTrend(
  sensors: TwinSensorSnapshot,
  health: number,
  progression: { temperature: number; vibration: number; current: number; speed: number; health: number },
): TwinTrendPoint[] {
  return labels.map((time, index) => {
    const remaining = labels.length - 1 - index;
    const gentleWave = remaining === 0 ? 0 : Math.sin(index * 1.3) * 0.12;
    return {
      time,
      temperature: Number((sensors.temperature - progression.temperature * remaining + gentleWave * 2).toFixed(1)),
      vibration: Number((sensors.vibration - progression.vibration * remaining + gentleWave).toFixed(1)),
      current: Number((sensors.current - progression.current * remaining + gentleWave).toFixed(1)),
      speed: Math.round(sensors.speed - progression.speed * remaining + gentleWave * 3),
      health: Math.round(Math.min(100, health + progression.health * remaining)),
    };
  });
}

const normalSensors = { temperature: 54, vibration: 2.1, speed: 1480, current: 38 };
const imbalanceSensors = { temperature: 66, vibration: 7.4, speed: 1468, current: 43 };
const bearingSensors = { temperature: 82, vibration: 5.2, speed: 1472, current: 41 };
const couplingSensors = { temperature: 73, vibration: 6.8, speed: 1459, current: 46 };

export const faultScenarios: Record<FaultScenarioId, FaultScenario> = {
  normal: {
    id: 'normal', name: '正常运行', status: '高负荷稳定运行', health: 96, risk: '低', probability: 4,
    sensors: normalSensors, diagnosis: '当前主要指标位于演示工况基准范围内，未发现持续异常趋势。',
    advice: ['按既定点检周期检查轴承、联轴器和润滑状态', '持续观察振动与温度趋势'], deadline: '按计划点检',
    faultPart: '无明确故障部位', targetPart: null, highlightColor: digitalTwinTheme.scene.neutralHighlight,
    trends: buildTrend(normalSensors, 96, { temperature: 0.05, vibration: 0.01, current: 0.03, speed: 0.2, health: 0.1 }),
    timeline: [
      { time: '08:00', title: '班次巡检完成', detail: '外观、紧固和润滑状态未见明显异常。' },
      { time: '11:00', title: '工况稳定', detail: '振动与温度处于模拟基准范围。' },
      { time: '当前', title: '持续监测', detail: '规则模型未触发故障预警。' },
    ],
  },
  'impeller-imbalance': {
    id: 'impeller-imbalance', name: '叶轮不平衡', status: '振动持续升高', health: 58, risk: '中高', probability: 82,
    sensors: imbalanceSensors, diagnosis: '疑似叶轮积灰、磨损或质量分布不均，建议结合频谱和现场检查进一步确认。',
    advice: ['检查叶轮积灰与叶片磨损', '复核叶轮及紧固件状态', '条件具备时进行动平衡检测'], deadline: '24小时内安排检查',
    faultPart: '叶轮 / 转子', targetPart: 'impeller', highlightColor: digitalTwinTheme.scene.warningHighlight,
    trends: buildTrend(imbalanceSensors, 58, { temperature: 0.7, vibration: 0.62, current: 0.28, speed: -0.5, health: 4.4 }),
    timeline: [
      { time: '09:00', title: '振动偏离基准', detail: '振动速度连续三个采样周期升高。' },
      { time: '12:00', title: '规则触发', detail: '振动趋势与叶轮不平衡规则相似。' },
      { time: '当前', title: '待现场确认', detail: '建议检查积灰、磨损与紧固状态。' },
    ],
  },
  'bearing-overheat': {
    id: 'bearing-overheat', name: '轴承温升', status: '温度异常上升', health: 42, risk: '高', probability: 89,
    sensors: bearingSensors, diagnosis: '驱动端轴承存在润滑不足、磨损或冷却异常风险，需结合现场温度复测和润滑检查确认。',
    advice: ['24小时内检查润滑油脂状态', '测量轴承游隙并检查磨损', '确认轴承座冷却和通风条件'], deadline: '24小时内检查',
    faultPart: '驱动端轴承', targetPart: 'bearing', highlightColor: digitalTwinTheme.scene.dangerHighlight,
    trends: buildTrend(bearingSensors, 42, { temperature: 2.4, vibration: 0.34, current: 0.2, speed: -0.25, health: 5.2 }),
    timeline: [
      { time: '09:00', title: '温度趋势上扬', detail: '驱动端温度开始偏离高负荷工况基准。' },
      { time: '12:00', title: '温振关联异常', detail: '温度持续上升并伴随振动增大。' },
      { time: '当前', title: '高风险提示', detail: '建议24小时内完成现场检查。' },
    ],
  },
  'coupling-misalignment': {
    id: 'coupling-misalignment', name: '联轴器不对中', status: '轴系振动异常', health: 49, risk: '高', probability: 86,
    sensors: couplingSensors, diagnosis: '轴向和径向振动同步升高，疑似轴系不对中，建议结合现场测量进一步确认。',
    advice: ['停机并执行安全隔离后检查电机与风机轴线', '检查底座沉降与地脚紧固', '复核联轴器间隙和对中状态'], deadline: '具备安全条件后尽快检查',
    faultPart: '联轴器 / 轴系', targetPart: 'coupling', highlightColor: digitalTwinTheme.scene.dangerHighlight,
    trends: buildTrend(couplingSensors, 49, { temperature: 1.3, vibration: 0.58, current: 0.5, speed: -0.65, health: 4.8 }),
    timeline: [
      { time: '09:00', title: '轴向振动升高', detail: '轴向和径向振动出现同步变化。' },
      { time: '12:00', title: '对中规则匹配', detail: '趋势与联轴器不对中规则特征相似。' },
      { time: '当前', title: '等待检修安排', detail: '是否停机由现场负责人结合安全规程决定。' },
    ],
  },
};

export const faultScenarioList = Object.values(faultScenarios);

export function isFaultScenarioId(value: string | null): value is FaultScenarioId {
  return Boolean(value && value in faultScenarios);
}

export function faultScenarioFromAlertIndicators(indicators: string[]): FaultScenarioId {
  const text = indicators.join('');
  if (/联轴|对中/.test(text)) return 'coupling-misalignment';
  if (/轴承温度|温升|温度/.test(text)) return 'bearing-overheat';
  if (/叶轮|不平衡/.test(text)) return 'impeller-imbalance';
  return 'impeller-imbalance';
}
