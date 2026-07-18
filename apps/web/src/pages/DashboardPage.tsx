import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowUpRight, Network } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DashboardData } from '@fengsui/shared';
import { EquipmentTopology } from '../components/dashboard/EquipmentTopology';
import { AlertBanner, ChartPanel, IndustrialPanel, MetricCard } from '../components/industrial';
import { PageHeader } from '../components/PageHeader';
import { Empty, ErrorState, Loading, RiskBadge, StatusBadge } from '../components/ui';
import { api } from '../services/api';
import { industrialTheme, riskColor } from '../theme/industrialTheme';
import '../components/dashboard/topology.css';
import './dashboard.css';

const timeLabel = (value: string) => new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const axisTick = { fontSize: 10, fill: industrialTheme.chart.text };

export function DashboardPage() {
  const navigate = useNavigate();
  const [range, setRange] = useState('24h');
  const query = useQuery({ queryKey: ['dashboard', range], queryFn: () => api<DashboardData>(`/dashboard?range=${range}`) });
  if (query.isLoading) return <Loading />;
  if (query.isError || !query.data) return <ErrorState error={query.error} retry={() => query.refetch()} />;
  const data = query.data;
  const statistics = [
    { label: '设备总数', value: data.statistics.total, tone: 'primary' as const, to: '/equipment' },
    { label: '正常设备', value: data.statistics.healthy, tone: 'success' as const, to: '/equipment?riskLevel=健康' },
    { label: '关注设备', value: data.statistics.attention, tone: 'default' as const, to: '/equipment?riskLevel=关注' },
    { label: '预警设备', value: data.statistics.warning, tone: 'warning' as const, to: '/equipment?riskLevel=二级预警' },
    { label: '高风险设备', value: data.statistics.highRisk, tone: 'danger' as const, to: '/equipment?riskLevel=高风险' },
    { label: '今日新增预警', value: data.statistics.todayAlerts, tone: 'warning' as const, to: '/alerts' },
    { label: '待处理工单', value: data.statistics.pendingOrders, tone: 'primary' as const, to: '/work-orders' },
    { label: '低库存备件', value: data.statistics.lowStock, tone: 'warning' as const, to: '/spare-parts?stockStatus=偏低' },
  ];
  const riskData = ['健康', '关注', '二级预警', '高风险'].map((name) => ({ name, value: data.equipment.filter((item) => item.riskLevel === name).length }));
  const ranking = data.equipment.slice().sort((a, b) => a.healthScore - b.healthScore).slice(0, 7).map((item) => ({ name: item.deviceName, 健康度: item.healthScore }));

  return <div className="app-page dashboard-page">
    <PageHeader title="设备总览" description="垃圾焚烧发电关键设备拓扑、健康状态与运维任务总览" actions={<div className="dashboard-range" aria-label="趋势时间范围">{([['24h', '24小时'], ['7d', '7天'], ['30d', '30天']] as const).map(([value, label]) => <button key={value} onClick={() => setRange(value)} className={range === value ? 'is-active' : ''}>{label}</button>)}</div>} />
    <AlertBanner tone="warning" title="模拟演示数据" description="设备状态和规则研判仅用于比赛展示，不代表真实生产诊断结果。" />

    <IndustrialPanel className="dashboard-metrics mt-4">{statistics.map((item) => <MetricCard key={item.label} {...item} onClick={() => navigate(item.to)} />)}</IndustrialPanel>

    <IndustrialPanel title="垃圾焚烧厂关键设备拓扑" meta="设备节点来自当前台账 · 低频数据流动画" className="mt-4" extra={<div className="flex items-center gap-2 text-[10px] text-[var(--industrial-text-muted)]"><Network size={13} className="text-[var(--industrial-primary)]" />点击节点穿透设备层级</div>}>
      <EquipmentTopology equipment={data.equipment} />
    </IndustrialPanel>

    <div className="dashboard-chart-grid mt-4">
      <ChartPanel title={`整体健康度趋势 · ${range === '24h' ? '最近24小时' : range === '7d' ? '最近7天' : '最近30天'}`} meta="健康度 / 100" className="dashboard-health-chart"><div className="h-[260px] p-4"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.healthTrend}><CartesianGrid strokeDasharray="3 3" stroke={industrialTheme.chart.grid} /><XAxis dataKey="time" tickFormatter={timeLabel} minTickGap={35} tick={axisTick} /><YAxis domain={[40, 100]} unit="分" tick={axisTick} /><Tooltip labelFormatter={(value) => timeLabel(String(value))} formatter={(value) => [`${value} 分`, '健康度']} /><Area isAnimationActive={false} type="monotone" dataKey="health" name="整体健康度" stroke={industrialTheme.chart.health} strokeWidth={2} fill={industrialTheme.chart.healthFill} fillOpacity={0.08} /></AreaChart></ResponsiveContainer></div></ChartPanel>
      <ChartPanel title="设备风险等级分布" meta={`当前共 ${data.statistics.total} 台设备`}><div className="h-[260px] p-3"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie isAnimationActive={false} data={riskData} innerRadius={48} outerRadius={76} paddingAngle={3} dataKey="value" nameKey="name" label={({ name, value }) => `${name} ${value}`} labelLine={false}>{riskData.map((item) => <Cell key={item.name} fill={riskColor(item.name)} />)}</Pie><Tooltip formatter={(value) => [`${value} 台`, '设备数']} /><Legend /></PieChart></ResponsiveContainer></div></ChartPanel>
      <ChartPanel title="关键设备健康度排名" meta="按风险优先排序"><div className="h-[260px] p-3"><ResponsiveContainer width="100%" height="100%"><BarChart data={ranking} layout="vertical" margin={{ left: 18 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={industrialTheme.chart.grid} /><XAxis type="number" domain={[0, 100]} unit="分" tick={axisTick} /><YAxis type="category" dataKey="name" width={82} tick={axisTick} /><Tooltip formatter={(value) => [`${value} 分`, '健康度']} /><Bar isAnimationActive={false} dataKey="健康度" radius={[0, 2, 2, 0]}>{ranking.map((item) => <Cell key={item.name} fill={item.健康度 < 60 ? industrialTheme.chart.danger : item.健康度 < 75 ? industrialTheme.chart.warning : item.健康度 < 90 ? industrialTheme.chart.attention : '#58738a'} />)}</Bar></BarChart></ResponsiveContainer></div></ChartPanel>
    </div>

    <div className="dashboard-secondary-grid mt-4">
      <ChartPanel title="异常指标类型分布" meta="当前预警样本"><div className="h-[240px] p-4">{data.abnormalDistribution.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={data.abnormalDistribution}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke={industrialTheme.chart.grid} /><XAxis dataKey="name" tick={axisTick} /><YAxis allowDecimals={false} unit="次" tick={axisTick} /><Tooltip formatter={(value) => [`${value} 次`, '异常数']} /><Bar isAnimationActive={false} dataKey="value" name="异常数" fill={industrialTheme.chart.warning} radius={[2, 2, 0, 0]} /></BarChart></ResponsiveContainer> : <Empty />}</div></ChartPanel>
      <ChartPanel title="各系统区域设备状态" meta="健康 / 需关注"><div className="h-[240px] p-4"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.areaDistribution}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke={industrialTheme.chart.grid} /><XAxis dataKey="area" tick={{ ...axisTick, fontSize: 9 }} /><YAxis allowDecimals={false} unit="台" tick={axisTick} /><Tooltip /><Legend /><Bar isAnimationActive={false} stackId="a" dataKey="healthy" name="健康" fill={industrialTheme.chart.success} /><Bar isAnimationActive={false} stackId="a" dataKey="risk" name="需关注" fill={industrialTheme.chart.warning} radius={[2, 2, 0, 0]} /></BarChart></ResponsiveContainer></div></ChartPanel>
      <IndustrialPanel title="重点设备实时状态" meta="按健康度升序" extra={<button className="panel-link" onClick={() => navigate('/equipment')}>查看全部<ArrowUpRight size={12} /></button>}>
        <div className="dashboard-device-stream">{data.equipment.slice().sort((a, b) => a.healthScore - b.healthScore).slice(0, 5).map((item) => <button key={item.deviceId} onClick={() => navigate(`/equipment/${item.deviceId}`)}><span><i style={{ background: riskColor(item.riskLevel) }} /><strong>{item.deviceName}</strong><small>{item.operatingCondition} · {item.systemArea}</small></span><span className="industrial-data">{item.healthScore}<RiskBadge level={item.riskLevel} /></span></button>)}</div>
      </IndustrialPanel>
    </div>

    <div className="dashboard-list-grid mt-4">
      <IndustrialPanel title="最近预警" meta="按触发时间倒序" extra={<button className="panel-link" onClick={() => navigate('/alerts')}>进入预警中心<ArrowUpRight size={12} /></button>}>
        <div className="dashboard-event-list">{data.recentAlerts.slice(0, 5).map((alert) => <button key={alert.alertId} onClick={() => navigate(`/alerts/${alert.alertId}`)}><span className="dashboard-event-list__icon"><Activity size={14} /></span><span className="min-w-0 flex-1"><strong>{alert.deviceName} · {alert.abnormalIndicators.join('、')}</strong><small>{new Date(alert.alertTime).toLocaleString('zh-CN')} · {alert.operatingCondition}</small></span><span className="text-right"><RiskBadge level={alert.riskLevel} /><small>{alert.healthScore} 分</small></span></button>)}</div>
      </IndustrialPanel>
      <IndustrialPanel title="待处理维修工单" meta="真实工单状态" extra={<button className="panel-link" onClick={() => navigate('/work-orders')}>进入工单中心<ArrowUpRight size={12} /></button>}>
        <div className="dashboard-event-list">{data.pendingWorkOrders.length ? data.pendingWorkOrders.slice(0, 5).map((order) => <button key={order.workOrderId} onClick={() => navigate(`/work-orders/${order.workOrderId}`)}><span className="industrial-data dashboard-order-id">{order.workOrderId}</span><span className="min-w-0 flex-1"><strong>{order.deviceName}</strong><small>{order.assignee} · 截止 {new Date(order.deadline).toLocaleString('zh-CN')}</small></span><StatusBadge status={order.status} /></button>) : <Empty title="暂无待处理工单" />}</div>
      </IndustrialPanel>
    </div>
  </div>;
}
