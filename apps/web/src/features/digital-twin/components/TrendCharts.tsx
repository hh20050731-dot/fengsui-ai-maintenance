import { Activity, HeartPulse, Thermometer } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { FaultScenario, TwinTrendPoint } from '../digitalTwinTypes';

function TrendCard({ title, data, dataKey, unit, color, icon: Icon }: { title: string; data: TwinTrendPoint[]; dataKey: keyof TwinTrendPoint; unit: string; color: string; icon: typeof Activity }) {
  return <section className="panel overflow-hidden"><div className="panel-header"><h2 className="flex items-center gap-2 text-sm font-semibold text-[#1F2329]"><Icon size={15} className="text-[#646A73]" />{title}</h2><span className="text-xs text-[#8F959E]">{unit}</span></div><div className="h-48 p-3"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}><CartesianGrid stroke="#EDEEF0" vertical={false} /><XAxis dataKey="time" tick={{ fill: '#8F959E', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#D9DADC' }} /><YAxis domain={['auto', 'auto']} tick={{ fill: '#8F959E', fontSize: 10 }} tickLine={false} axisLine={false} /><Tooltip formatter={(value) => [`${value} ${unit}`, title]} contentStyle={{ borderColor: '#E5E6EB', borderRadius: 4, boxShadow: 'none' }} /><Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} /></LineChart></ResponsiveContainer></div></section>;
}

export function TrendCharts({ scenario }: { scenario: FaultScenario }) {
  return <div className="mt-4">
    <div className="grid gap-4 lg:grid-cols-3">
      <TrendCard title="轴承温度趋势" data={scenario.trends} dataKey="temperature" unit="℃" color="#A66D4F" icon={Thermometer} />
      <TrendCard title="振动速度趋势" data={scenario.trends} dataKey="vibration" unit="mm/s" color="#71859B" icon={Activity} />
      <TrendCard title="健康度变化" data={scenario.trends} dataKey="health" unit="分" color="#6F8776" icon={HeartPulse} />
    </div>
    <section className="panel mt-4 overflow-hidden"><div className="panel-header"><h2 className="panel-title">故障事件时间线</h2><span className="text-xs text-[#8F959E]">{scenario.name}</span></div><div className="grid gap-0 md:grid-cols-3">{scenario.timeline.map((event, index) => <div key={`${event.time}-${event.title}`} className={`relative p-4 ${index ? 'border-t border-[#E5E6EB] md:border-l md:border-t-0' : ''}`}><div className="text-xs font-medium text-[#8F959E]">{event.time}</div><div className="mt-1.5 text-sm font-medium text-[#1F2329]">{event.title}</div><p className="mt-1 text-xs leading-5 text-[#646A73]">{event.detail}</p></div>)}</div></section>
  </div>;
}
