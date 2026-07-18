import { Activity, Gauge, RotateCw, Thermometer, Zap } from 'lucide-react';
import clsx from 'clsx';
import type { FaultScenario } from '../digitalTwinTypes';

export function SensorStatusPanel({ scenario }: { scenario: FaultScenario }) {
  const highRisk = scenario.risk === '高';
  const metrics = [
    { label: '轴承温度', value: scenario.sensors.temperature, unit: '℃', icon: Thermometer, testId: 'twin-temperature' },
    { label: '振动速度', value: scenario.sensors.vibration, unit: 'mm/s', icon: Activity, testId: 'twin-vibration' },
    { label: '转速', value: scenario.sensors.speed, unit: 'r/min', icon: RotateCw, testId: 'twin-speed' },
    { label: '电流', value: scenario.sensors.current, unit: 'A', icon: Zap, testId: 'twin-current' },
  ];
  return <section className="twin-panel twin-status-panel">
    <div className="twin-panel__header"><h2 className="twin-panel__title">运行状态</h2><span className="twin-online twin-status-online">在线</span></div>
    <div className="twin-kpi-grid">
      <div className="twin-kpi"><div className="twin-kpi__label">健康度</div><div data-testid="twin-health-score" className={clsx('twin-kpi__value twin-data', highRisk ? 'is-danger' : scenario.health >= 90 && 'is-success')}>{scenario.health}</div></div>
      <div className="twin-kpi"><div className="twin-kpi__label">风险等级</div><div className={clsx('twin-kpi__value text-base', highRisk ? 'is-danger' : scenario.risk === '低' && 'is-success')}>{scenario.risk}</div></div>
      <div className="twin-kpi"><div className="twin-kpi__label">故障概率</div><div className={clsx('twin-kpi__value twin-data', highRisk && 'is-danger')}>{scenario.probability}<span className="twin-kpi__unit">%</span></div></div>
    </div>
    <div className="twin-metric-grid">{metrics.map(({ label, value, unit, icon: Icon, testId }) => <div key={label} data-testid={testId} className={clsx('twin-metric', highRisk && ['轴承温度', '振动速度'].includes(label) && 'is-alert')}><div className="twin-metric__label"><Icon size={13} />{label}</div><div className="twin-metric__value">{value}<span className="twin-kpi__unit">{unit}</span></div></div>)}</div>
    <div className="twin-condition"><Gauge size={13} />当前状态：<strong className="font-medium">{scenario.status}</strong></div>
  </section>;
}
