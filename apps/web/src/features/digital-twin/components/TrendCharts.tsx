import { Activity, HeartPulse, Thermometer } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { FaultScenario, TwinTrendPoint } from '../digitalTwinTypes';
import { digitalTwinTheme } from '../digitalTwinTheme';

function TrendCard({ title, data, dataKey, unit, color, icon: Icon }: { title: string; data: TwinTrendPoint[]; dataKey: keyof TwinTrendPoint; unit: string; color: string; icon: typeof Activity }) {
  return <section className="twin-trend-card"><div className="twin-panel__header"><h2 className="flex items-center gap-2 text-sm font-semibold"><Icon size={15} className="twin-muted" />{title}</h2><span className="twin-panel__meta">{unit}</span></div><div className="twin-trend-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}><CartesianGrid stroke={digitalTwinTheme.chart.grid} vertical={false} /><XAxis dataKey="time" tick={{ fill: digitalTwinTheme.chart.text, fontSize: 10 }} tickLine={false} axisLine={{ stroke: digitalTwinTheme.chart.axis }} /><YAxis domain={['auto', 'auto']} tick={{ fill: digitalTwinTheme.chart.text, fontSize: 10 }} tickLine={false} axisLine={false} /><Tooltip formatter={(value) => [`${value} ${unit}`, title]} contentStyle={{ background: digitalTwinTheme.chart.tooltipBackground, borderColor: digitalTwinTheme.chart.axis, borderRadius: 4, boxShadow: 'none', color: digitalTwinTheme.chart.tooltipText }} labelStyle={{ color: digitalTwinTheme.chart.text }} /><Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} /></LineChart></ResponsiveContainer></div></section>;
}

export function TrendCharts({ scenario }: { scenario: FaultScenario }) {
  return <div className="twin-trends">
    <div className="twin-trend-grid">
      <TrendCard title="轴承温度趋势" data={scenario.trends} dataKey="temperature" unit="℃" color={digitalTwinTheme.chart.temperature} icon={Thermometer} />
      <TrendCard title="振动速度趋势" data={scenario.trends} dataKey="vibration" unit="mm/s" color={digitalTwinTheme.chart.vibration} icon={Activity} />
      <TrendCard title="健康度变化" data={scenario.trends} dataKey="health" unit="分" color={digitalTwinTheme.chart.health} icon={HeartPulse} />
    </div>
    <section className="twin-trend-card twin-timeline"><div className="twin-panel__header"><h2 className="twin-panel__title">故障事件时间线</h2><span className="twin-panel__meta">{scenario.name}</span></div><div className="twin-timeline-grid">{scenario.timeline.map((event) => <div key={`${event.time}-${event.title}`} className="twin-timeline-event"><div className="twin-timeline-time">{event.time}</div><div className="twin-timeline-title">{event.title}</div><p className="twin-timeline-detail">{event.detail}</p></div>)}</div></section>
  </div>;
}
