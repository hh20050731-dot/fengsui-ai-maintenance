import { Activity, Gauge, RotateCw, Thermometer, Zap } from 'lucide-react';
import clsx from 'clsx';
import type { FaultScenario } from '../digitalTwinTypes';

export function SensorStatusPanel({ scenario }: { scenario: FaultScenario }) {
  const metrics = [
    { label: '轴承温度', value: scenario.sensors.temperature, unit: '℃', icon: Thermometer, testId: 'twin-temperature' },
    { label: '振动速度', value: scenario.sensors.vibration, unit: 'mm/s', icon: Activity, testId: 'twin-vibration' },
    { label: '转速', value: scenario.sensors.speed, unit: 'r/min', icon: RotateCw, testId: 'twin-speed' },
    { label: '电流', value: scenario.sensors.current, unit: 'A', icon: Zap, testId: 'twin-current' },
  ];
  return <section className="panel overflow-hidden">
    <div className="panel-header"><h2 className="panel-title">运行状态</h2><span className="flex items-center gap-1.5 text-xs text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />在线</span></div>
    <div className="grid grid-cols-3 border-b border-[#E5E6EB]">
      <div className="p-3"><div className="text-[11px] text-[#8F959E]">健康度</div><div data-testid="twin-health-score" className={clsx('mt-1 text-2xl font-semibold tabular-nums', scenario.health < 60 ? 'text-red-700' : scenario.health < 75 ? 'text-orange-700' : 'text-[#1F2329]')}>{scenario.health}</div></div>
      <div className="border-l border-[#E5E6EB] p-3"><div className="text-[11px] text-[#8F959E]">风险等级</div><div className={clsx('mt-2 text-sm font-semibold', scenario.risk === '高' ? 'text-red-700' : scenario.risk === '中高' ? 'text-orange-700' : 'text-emerald-700')}>{scenario.risk}</div></div>
      <div className="border-l border-[#E5E6EB] p-3"><div className="text-[11px] text-[#8F959E]">故障概率</div><div className="mt-1 text-2xl font-semibold tabular-nums text-[#1F2329]">{scenario.probability}<span className="ml-0.5 text-xs font-normal text-[#8F959E]">%</span></div></div>
    </div>
    <div className="grid grid-cols-2">{metrics.map(({ label, value, unit, icon: Icon, testId }, index) => <div key={label} data-testid={testId} className={clsx('p-3', index % 2 === 1 && 'border-l border-[#E5E6EB]', index >= 2 && 'border-t border-[#E5E6EB]')}><div className="flex items-center gap-1.5 text-[11px] text-[#8F959E]"><Icon size={13} />{label}</div><div className="mt-1.5 font-semibold tabular-nums text-[#1F2329]">{value}<span className="ml-1 text-[11px] font-normal text-[#8F959E]">{unit}</span></div></div>)}</div>
    <div className="flex items-center gap-2 border-t border-[#E5E6EB] bg-[#FAFAFA] px-4 py-2.5 text-xs text-[#646A73]"><Gauge size={14} />当前状态：<strong className="font-medium text-[#3A3F47]">{scenario.status}</strong></div>
  </section>;
}
