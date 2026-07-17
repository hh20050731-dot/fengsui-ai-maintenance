import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DashboardData } from '@fengsui/shared';
import { PageHeader } from '../components/PageHeader';
import { DemoDisclaimer, Empty, ErrorState, Loading, Panel, RiskBadge, StatusBadge } from '../components/ui';
import { api } from '../services/api';

const COLORS = ['#7FA58A', '#8293A8', '#C8894A', '#B85C5C'];
const timeLabel = (value: string) => new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function DashboardPage() {
  const navigate = useNavigate(); const [range, setRange] = useState('24h');
  const query = useQuery({ queryKey: ['dashboard', range], queryFn: () => api<DashboardData>(`/dashboard?range=${range}`) });
  if (query.isLoading) return <Loading />; if (query.isError || !query.data) return <ErrorState error={query.error} retry={() => query.refetch()} />;
  const data = query.data;
  const statistics = [
    { label: '设备总数', value: data.statistics.total, tone: 'text-[#1F2329]', to: '/equipment' },
    { label: '正常设备', value: data.statistics.healthy, tone: 'text-[#1F2329]', to: '/equipment?riskLevel=健康' },
    { label: '关注设备', value: data.statistics.attention, tone: 'text-[#5F7084]', to: '/equipment?riskLevel=关注' },
    { label: '预警设备', value: data.statistics.warning, tone: 'text-orange-700', to: '/equipment?riskLevel=二级预警' },
    { label: '高风险设备', value: data.statistics.highRisk, tone: 'text-red-700', to: '/equipment?riskLevel=高风险' },
    { label: '今日新增预警', value: data.statistics.todayAlerts, tone: 'text-orange-700', to: '/alerts' },
    { label: '待处理工单', value: data.statistics.pendingOrders, tone: 'text-[#1F2329]', to: '/work-orders' },
    { label: '低库存备件', value: data.statistics.lowStock, tone: 'text-orange-700', to: '/spare-parts?stockStatus=偏低' },
  ];
  const riskData = ['健康', '关注', '二级预警', '高风险'].map((name) => ({ name, value: data.equipment.filter((item) => item.riskLevel === name).length }));
  const ranking = data.equipment.slice().sort((a, b) => a.healthScore - b.healthScore).slice(0, 7).map((item) => ({ name: item.deviceName, 健康度: item.healthScore }));
  return <div>
    <PageHeader title="设备总览" description="关键设备健康状态、异常趋势和运维任务" actions={<div className="flex rounded border border-[#D9DADC] bg-white p-0.5">{([['24h', '24小时'], ['7d', '7天'], ['30d', '30天']] as const).map(([value, label]) => <button key={value} onClick={() => setRange(value)} className={`rounded-sm px-3 py-1.5 text-xs font-medium ${range === value ? 'bg-[#4E5969] text-white' : 'text-[#646A73] hover:bg-[#F2F3F5]'}`}>{label}</button>)}</div>} />
    <DemoDisclaimer />
    <div className="panel mt-4 grid grid-cols-2 overflow-hidden sm:grid-cols-4 xl:grid-cols-8">{statistics.map(({ label, value, tone, to }, index) => <button key={label} className={`min-w-0 px-4 py-3 text-left transition-colors hover:bg-[#FAFAFA] ${index > 0 ? 'border-l border-[#E5E6EB]' : ''}`} onClick={() => navigate(to)}><div className={`text-xl font-semibold tabular-nums ${tone}`}>{value}</div><div className="mt-1 truncate text-xs text-[#646A73]">{label}</div></button>)}</div>
    <div className="mt-4 grid gap-4 xl:grid-cols-[1.65fr_1fr_1fr]">
      <Panel title={`整体健康度趋势 · ${range === '24h' ? '最近24小时' : range === '7d' ? '最近7天' : '最近30天'}`} className="xl:col-span-1"><div className="h-72 p-4"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.healthTrend}><CartesianGrid strokeDasharray="3 3" stroke="#EDEEF0" /><XAxis dataKey="time" tickFormatter={timeLabel} minTickGap={35} tick={{ fontSize: 10, fill: '#8F959E' }} /><YAxis domain={[40, 100]} unit="分" tick={{ fontSize: 10, fill: '#8F959E' }} /><Tooltip labelFormatter={(value) => timeLabel(String(value))} formatter={(value) => [`${value} 分`, '健康度']} /><Area isAnimationActive={false} type="monotone" dataKey="health" name="整体健康度" stroke="#66788A" strokeWidth={2} fill="#91A7BF" fillOpacity={0.08} /></AreaChart></ResponsiveContainer></div></Panel>
      <Panel title="设备风险等级分布"><div className="h-72 p-3"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie isAnimationActive={false} data={riskData} innerRadius={46} outerRadius={72} paddingAngle={3} dataKey="value" nameKey="name" label={({ name, value }) => `${name} ${value}`} labelLine={false}>{riskData.map((_, index) => <Cell key={index} fill={COLORS[index]} />)}</Pie><Tooltip formatter={(value) => [`${value} 台`, '设备数']} /><Legend /></PieChart></ResponsiveContainer></div></Panel>
      <Panel title="关键设备健康度排名"><div className="h-72 p-3"><ResponsiveContainer width="100%" height="100%"><BarChart data={ranking} layout="vertical" margin={{ left: 20 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#EDEEF0" /><XAxis type="number" domain={[0, 100]} unit="分" tick={{ fontSize: 10, fill: '#8F959E' }} /><YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10, fill: '#646A73' }} /><Tooltip formatter={(value) => [`${value} 分`, '健康度']} /><Bar isAnimationActive={false} dataKey="健康度" radius={[0, 2, 2, 0]}>{ranking.map((item) => <Cell key={item.name} fill={item.健康度 < 60 ? '#B85C5C' : item.健康度 < 75 ? '#C8894A' : item.健康度 < 90 ? '#8293A8' : '#B7BBC1'} />)}</Bar></BarChart></ResponsiveContainer></div></Panel>
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      <Panel title="异常指标类型分布"><div className="h-64 p-4">{data.abnormalDistribution.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={data.abnormalDistribution}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDEEF0" /><XAxis dataKey="name" tick={{ fontSize: 10, fill: '#646A73' }} /><YAxis allowDecimals={false} unit="次" tick={{ fontSize: 10, fill: '#8F959E' }} /><Tooltip formatter={(value) => [`${value} 次`, '异常数']} /><Bar isAnimationActive={false} dataKey="value" name="异常数" fill="#C8894A" radius={[2, 2, 0, 0]} /></BarChart></ResponsiveContainer> : <Empty />}</div></Panel>
      <Panel title="各系统区域设备状态"><div className="h-64 p-4"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.areaDistribution}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDEEF0" /><XAxis dataKey="area" tick={{ fontSize: 9, fill: '#646A73' }} /><YAxis allowDecimals={false} unit="台" tick={{ fontSize: 10, fill: '#8F959E' }} /><Tooltip /><Legend /><Bar isAnimationActive={false} stackId="a" dataKey="healthy" name="健康" fill="#7FA58A" /><Bar isAnimationActive={false} stackId="a" dataKey="risk" name="需关注" fill="#C8894A" radius={[2, 2, 0, 0]} /></BarChart></ResponsiveContainer></div></Panel>
      <Panel title="重点设备实时状态" extra={<button className="text-xs font-medium text-[#4E5969] hover:text-[#1F2329]" onClick={() => navigate('/equipment')}>查看全部</button>}><div className="divide-y divide-[#EDEEF0]">{data.equipment.slice().sort((a, b) => a.healthScore - b.healthScore).slice(0, 5).map((item) => <button key={item.deviceId} className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-[#FAFAFA]" onClick={() => navigate(`/equipment/${item.deviceId}`)}><div><div className="text-sm font-medium text-[#1F2329]">{item.deviceName}</div><div className="mt-1 text-xs text-[#8F959E]">{item.operatingCondition} · {item.systemArea}</div></div><div className="flex items-center gap-3"><span className="text-lg font-semibold text-[#1F2329]">{item.healthScore}</span><RiskBadge level={item.riskLevel} /></div></button>)}</div></Panel>
    </div>
    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      <Panel title="最近预警" extra={<button className="text-xs font-medium text-brand-600" onClick={() => navigate('/alerts')}>进入预警中心</button>}><div className="table-wrap"><table className="data-table"><thead><tr><th>设备</th><th>风险</th><th>异常指标</th><th>时间</th><th>状态</th></tr></thead><tbody>{data.recentAlerts.map((item) => <tr key={item.alertId} className="cursor-pointer" onClick={() => navigate(`/alerts/${item.alertId}`)}><td className="font-medium">{item.deviceName}</td><td><RiskBadge level={item.riskLevel} /></td><td>{item.abnormalIndicators.join('、')}</td><td>{timeLabel(item.alertTime)}</td><td><StatusBadge status={item.alertStatus} /></td></tr>)}</tbody></table></div></Panel>
      <Panel title="待处理工单" extra={<button className="text-xs font-medium text-brand-600" onClick={() => navigate('/work-orders')}>进入工单中心</button>}><div className="table-wrap"><table className="data-table"><thead><tr><th>工单</th><th>设备</th><th>负责人</th><th>截止时间</th><th>状态</th></tr></thead><tbody>{data.pendingWorkOrders.map((item) => <tr key={item.workOrderId} className="cursor-pointer" onClick={() => navigate(`/work-orders/${item.workOrderId}`)}><td className="font-mono text-xs">{item.workOrderId}</td><td className="font-medium">{item.deviceName}</td><td>{item.assignee}</td><td>{timeLabel(item.deadline)}</td><td><StatusBadge status={item.status} /></td></tr>)}</tbody></table></div></Panel>
    </div>
  </div>;
}
