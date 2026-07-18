import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, RotateCcw, Search } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getNextWorkOrderActions, getWorkOrderIdentifiers, getWorkOrderNo, getWorkOrderTransitionIdentifier, type SparePart, type WorkOrder, type WorkOrderStatus } from '@fengsui/shared';
import { AlertBanner, DataTable, FilterBar, IndustrialPanel, Timeline, WorkOrderRail } from '../components/industrial';
import { PageHeader } from '../components/PageHeader';
import { DemoDisclaimer, Empty, ErrorState, Loading, Modal, RiskBadge, StatusBadge, Toast } from '../components/ui';
import { api, idempotencyKey, postJson } from '../services/api';
import { mergeUpdatedWorkOrder, resolveWorkOrderDetail, workOrderTransitionMessage } from './work-order-state';
import './work-orders.css';

const stages: WorkOrderStatus[] = ['待接单', '已接单', '检修中', '待验证', '已完成'];

function TransitionForm({ order, target, parts, onClose, onSuccess }: { order: WorkOrder; target: WorkOrderStatus; parts: SparePart[]; onClose: () => void; onSuccess: (order: WorkOrder) => void }) {
  const [note, setNote] = useState('');
  const [inspection, setInspection] = useState(order.inspectionResult ?? '检查轴承润滑状态、轴承间隙、联轴器对中及地脚螺栓，发现润滑油劣化并伴有轴承轻微磨损。');
  const [repair, setRepair] = useState(order.repairResult ?? '更换风机轴承和润滑油，完成联轴器复核及地脚螺栓紧固。');
  const [verification, setVerification] = useState('维修后振动降至3.1 mm/s、轴承温度降至68℃，连续稳定运行30分钟，指标恢复至工况基准范围。');
  const [health, setHealth] = useState(92);
  const [selected, setSelected] = useState<Record<string, number>>(() => Object.fromEntries((order.consumedSpareParts.length ? order.consumedSpareParts : order.deviceId === 'IDF-001' ? [{ partId: 'SP-001', quantity: 1 }, { partId: 'SP-002', quantity: 1 }] : []).map((item) => [item.partId, item.quantity])));
  const transitionIdentifier = getWorkOrderTransitionIdentifier(order);
  const transitionKey = useRef(idempotencyKey(`transition-${target}-${getWorkOrderNo(order) || 'missing'}`));
  const mutation = useMutation({ mutationFn: () => {
    if (!transitionIdentifier) throw new Error(`工单“${getWorkOrderNo(order) || '编号缺失'}”缺少可用标识，请刷新工单后重试`);
    return postJson<WorkOrder>(`/work-orders/${encodeURIComponent(transitionIdentifier)}/transition`, { targetStatus: target, operator: '黄浩', note, inspectionResult: target === '待验证' ? inspection : undefined, repairResult: target === '待验证' ? repair : undefined, consumedSpareParts: target === '待验证' ? Object.entries(selected).filter(([, quantity]) => quantity > 0).map(([partId, quantity]) => ({ partId, quantity })) : undefined, healthScoreAfter: target === '已完成' ? health : undefined, verificationResult: target === '已完成' ? verification : undefined, idempotencyKey: transitionKey.current });
  }, onSuccess });
  const label = target === '已接单' ? '确认接单' : target === '检修中' ? '开始检修' : target === '待验证' ? '提交维修结果' : target === '已完成' ? '完成验证并闭环' : target === '已取消' ? '取消工单' : `退回${target}`;
  return <Modal title={`${getWorkOrderNo(order)} · ${label}`} onClose={onClose}><div className="work-order-transition"><StatusBadge status={order.status} /><ArrowRight size={15} /><StatusBadge status={target} /></div>
    {target === '待验证' && <div className="space-y-4"><label><span className="label">检查结果 <b className="text-[var(--industrial-danger)]">*</b></span><textarea className="input min-h-24" value={inspection} onChange={(event) => setInspection(event.target.value)} /></label><label><span className="label">维修记录 <b className="text-[var(--industrial-danger)]">*</b></span><textarea className="input min-h-24" value={repair} onChange={(event) => setRepair(event.target.value)} /></label><div><span className="label">实际消耗备件（完成工单时扣减）</span><div className="work-order-part-selector">{parts.map((part) => <label key={part.partId}><span><input type="checkbox" checked={selected[part.partId] !== undefined} onChange={(event) => setSelected((items) => { const next = { ...items }; if (event.target.checked) next[part.partId] = 1; else delete next[part.partId]; return next; })} />{part.partName}<small>库存 {part.currentStock}{part.unit}</small></span>{selected[part.partId] !== undefined && <input type="number" min="1" max={part.currentStock} className="input w-20" value={selected[part.partId]} onChange={(event) => setSelected({ ...selected, [part.partId]: Number(event.target.value) })} />}</label>)}</div></div></div>}
    {target === '已完成' && <div className="space-y-4"><label><span className="label">维修后健康度 <b className="text-[var(--industrial-danger)]">*</b></span><input className="input" type="number" min="0" max="100" value={health} onChange={(event) => setHealth(Number(event.target.value))} /></label><label><span className="label">维修效果验证 <b className="text-[var(--industrial-danger)]">*</b></span><textarea className="input min-h-28" value={verification} onChange={(event) => setVerification(event.target.value)} /></label><AlertBanner tone="success" title="闭环联动" description="完成后将更新设备健康度、扣减实际备件、关闭预警并沉淀候选案例；幂等控制防止重复扣减。" /></div>}
    {!['待验证', '已完成'].includes(target) && <label><span className="label">处理说明{target === '已取消' ? ' *' : ''}</span><textarea className="input min-h-24" value={note} onChange={(event) => setNote(event.target.value)} placeholder="补充本次状态推进说明" /></label>}
    {!transitionIdentifier && <div className="mt-4 rounded border border-[rgba(224,82,93,.35)] bg-[var(--industrial-danger-soft)] p-3 text-sm text-[#ff8b94]">无法定位工单“{getWorkOrderNo(order) || '编号缺失'}”，请关闭弹窗并刷新工单。</div>}
    {mutation.isError && <div className="mt-4 rounded border border-[rgba(224,82,93,.35)] bg-[var(--industrial-danger-soft)] p-3 text-sm text-[#ff8b94]">{mutation.error.message}</div>}
    <div className="mt-6 flex justify-end gap-2"><button className="btn-secondary" onClick={onClose}>取消</button><button data-testid={`confirm-transition-${target}`} className={target === '已取消' ? 'btn-danger' : 'btn-primary'} disabled={!transitionIdentifier || mutation.isPending || (target === '待验证' && (!inspection.trim() || !repair.trim())) || (target === '已完成' && !verification.trim())} onClick={() => mutation.mutate()}>{mutation.isPending ? '正在更新…' : label}</button></div>
  </Modal>;
}

function WorkOrderDetail({ order, parts, onClose }: { order: WorkOrder; parts: SparePart[]; onClose: () => void }) {
  const queryClient = useQueryClient(); const navigate = useNavigate(); const [target, setTarget] = useState<WorkOrderStatus | null>(null); const [toast, setToast] = useState('');
  const onSuccess = (updated: WorkOrder) => {
    const completedTarget = target;
    setTarget(null);
    for (const identifier of getWorkOrderIdentifiers({ ...order, ...updated })) queryClient.setQueryData<WorkOrder>(['work-order', identifier], (current) => ({ ...(current ?? order), ...updated }));
    queryClient.setQueryData<WorkOrder[]>(['work-orders'], (current) => mergeUpdatedWorkOrder(current, updated));
    setToast(workOrderTransitionMessage(updated, completedTarget));
    void Promise.all([queryClient.invalidateQueries({ queryKey: ['equipment'] }), queryClient.invalidateQueries({ queryKey: ['spare-parts'] }), queryClient.invalidateQueries({ queryKey: ['alerts'] })]);
    window.setTimeout(() => { void Promise.all([queryClient.invalidateQueries({ queryKey: ['work-orders'] }), ...getWorkOrderIdentifiers({ ...order, ...updated }).map((identifier) => queryClient.invalidateQueries({ queryKey: ['work-order', identifier] }))]); }, 500);
  };
  const actions = getNextWorkOrderActions(order.status);
  const timeline = order.processingRecord.slice().reverse().map((record) => ({ id: record.id, title: record.action, time: new Date(record.time).toLocaleString('zh-CN'), detail: record.detail, operator: record.operator }));
  return <><Modal title="维修工单详情" onClose={onClose} width="max-w-6xl">
    <div className="work-order-detail__header"><div><div className="flex flex-wrap items-center gap-3"><h3 className="industrial-data">{getWorkOrderNo(order)}</h3><StatusBadge status={order.status} /><RiskBadge level={order.riskLevel} />{order.syncStatus && <span className="work-order-sync"><i />飞书同步：{order.syncStatus === 'synced' ? '已同步' : '同步中'}</span>}</div><button onClick={() => navigate(`/equipment/${order.deviceId}`)}>{order.deviceName} · {order.deviceId}</button></div><div><span>负责人</span><strong>{order.assignee}</strong></div></div>
    <IndustrialPanel title="工单状态轨道" meta="状态转换沿用现有工单状态机" className="mt-4"><WorkOrderRail status={order.status} /></IndustrialPanel>
    {actions.length > 0 && <div className="work-order-detail__actions">{actions.map((action) => <button key={action} data-testid={`transition-${action}`} className={action === '已取消' ? 'btn-danger' : action === '检修中' && order.status === '待验证' ? 'btn-secondary' : 'btn-primary'} onClick={() => setTarget(action)}>{action === '已接单' ? '确认接单' : action === '检修中' && order.status === '已接单' ? '开始检修' : action === '检修中' ? <><RotateCcw size={15} />退回检修</> : action === '待验证' ? '提交维修结果' : action === '已完成' ? '完成验证并闭环' : '取消工单'}</button>)}</div>}
    <div className="work-order-detail__grid mt-4">
      <div className="work-order-detail__main">
        <IndustrialPanel title="故障描述" meta="故障与风险信息"><div className="work-order-copy">{order.faultDescription}</div></IndustrialPanel>
        <IndustrialPanel title="检修建议" meta="规则库建议"><ul className="work-order-suggestion">{order.maintenanceSuggestion.map((item) => <li key={item}>{item}</li>)}</ul></IndustrialPanel>
        {(order.inspectionResult || order.repairResult || order.verificationResult) && <div className="work-order-result-grid">{order.inspectionResult && <IndustrialPanel title="检查结果"><p>{order.inspectionResult}</p></IndustrialPanel>}{order.repairResult && <IndustrialPanel title="维修结果"><p>{order.repairResult}</p></IndustrialPanel>}{order.verificationResult && <IndustrialPanel title="验证结果"><p>{order.verificationResult}</p></IndustrialPanel>}</div>}
        <IndustrialPanel title="处理时间线" meta={`${order.processingRecord.length} 条记录`}><div className="p-5"><Timeline items={timeline} /></div></IndustrialPanel>
      </div>
      <aside className="work-order-detail__side">
        <IndustrialPanel title="健康度影响" meta="维修前 / 维修后"><div className="work-order-health-delta"><span><strong className="industrial-data">{order.healthScoreBefore}</strong><small>维修前</small></span><ArrowRight /><span><strong className="industrial-data is-after">{order.healthScoreAfter ?? '—'}</strong><small>维修后</small></span></div></IndustrialPanel>
        <IndustrialPanel title="工单信息"><div className="work-order-facts">{[['创建人', order.createdBy], ['创建时间', new Date(order.createdTime).toLocaleString('zh-CN')], ['截止时间', new Date(order.deadline).toLocaleString('zh-CN')], ['负责人', order.assignee]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></IndustrialPanel>
        <IndustrialPanel title="备件需求与消耗"><div className="work-order-parts"><h4>计划备件</h4>{order.requiredSpareParts.length ? order.requiredSpareParts.map((part) => <div key={part.partId}><span>{part.partName}</span><strong className="industrial-data">{part.quantity}{part.unit}</strong></div>) : <p>无计划备件</p>}<h4>实际消耗</h4>{order.consumedSpareParts.length ? order.consumedSpareParts.map((part) => <div key={part.partId}><span>{part.partName}</span><strong className="industrial-data">{part.quantity}{part.unit}</strong></div>) : <p>尚未登记</p>}</div></IndustrialPanel>
      </aside>
    </div>
    {order.status === '已完成' && <div className="mt-4"><AlertBanner tone="success" title="工单已完成" description="关键结果已锁定，设备状态、库存、预警和维修历史已完成联动更新。" /></div>}
  </Modal>{target && <TransitionForm order={order} target={target} parts={parts} onClose={() => setTarget(null)} onSuccess={onSuccess} />}{toast && <Toast message={toast} onClose={() => setToast('')} />}</>;
}

export function WorkOrdersPage() {
  const { workOrderId } = useParams(); const navigate = useNavigate(); const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') ?? ''); const [status, setStatus] = useState<WorkOrderStatus | ''>('');
  const query = useQuery({ queryKey: ['work-orders'], queryFn: () => api<WorkOrder[]>('/work-orders') });
  const partsQuery = useQuery({ queryKey: ['spare-parts'], queryFn: () => api<SparePart[]>('/spare-parts') });
  const detailQuery = useQuery({ queryKey: ['work-order', workOrderId], queryFn: () => api<WorkOrder>(`/work-orders/${encodeURIComponent(workOrderId!)}`), enabled: Boolean(workOrderId) });
  const rows = useMemo(() => (query.data ?? []).filter((item) => (!status || item.status === status) && (!search || `${getWorkOrderNo(item)}${item.deviceId}${item.deviceName}${item.assignee}`.toLowerCase().includes(search.toLowerCase()))), [query.data, status, search]);
  const selectedDetail = resolveWorkOrderDetail(detailQuery.data, query.data, workOrderId);
  if (query.isLoading || partsQuery.isLoading) return <Loading />; if (query.isError || partsQuery.isError) return <ErrorState error={query.error ?? partsQuery.error} />;
  const counts = Object.fromEntries(stages.map((stage) => [stage, query.data?.filter((order) => order.status === stage).length ?? 0])) as Partial<Record<WorkOrderStatus, number>>;
  return <div className="app-page work-orders-page"><PageHeader title="维修工单" description="以轨道式状态流程推进检修、验证和设备闭环" /><DemoDisclaimer compact />
    <IndustrialPanel title="工单状态总览" meta="点击节点筛选当前阶段" className="mt-4"><WorkOrderRail status={status || undefined} counts={counts} onSelect={(stage) => setStatus(status === stage ? '' : stage)} /></IndustrialPanel>
    <FilterBar summary={<>当前筛选结果 <strong className="industrial-data text-[var(--industrial-primary)]">{rows.length}</strong> 张工单</>}><div className="relative flex-1"><Search className="absolute left-3 top-2.5 text-[var(--industrial-text-muted)]" size={17} /><input className="input pl-9" placeholder="搜索工单、设备或负责人" value={search} onChange={(event) => setSearch(event.target.value)} /></div><select className="input sm:w-44" value={status} onChange={(event) => setStatus(event.target.value as WorkOrderStatus | '')}><option value="">全部状态</option>{[...stages, '已取消' as WorkOrderStatus].map((item) => <option key={item}>{item}</option>)}</select></FilterBar>
    <DataTable className="mt-4">{rows.length ? <><thead><tr><th>工单编号 / 创建时间</th><th>设备</th><th>风险等级</th><th>故障描述</th><th>负责人</th><th>截止时间</th><th>同步</th><th>状态</th><th>操作</th></tr></thead><tbody>{rows.map((order) => <tr key={order.workOrderId} className="cursor-pointer" onClick={() => navigate(`/work-orders/${order.workOrderId}`)}><td><div className="industrial-data work-order-id">{order.workOrderId}</div><div className="subtle mt-1">{new Date(order.createdTime).toLocaleString('zh-CN')}</div></td><td><strong className="text-[var(--industrial-text)]">{order.deviceName}</strong><div className="industrial-data subtle mt-1">{order.deviceId}</div></td><td><RiskBadge level={order.riskLevel} /></td><td><div className="max-w-xs truncate">{order.faultDescription}</div></td><td>{order.assignee}</td><td className={new Date(order.deadline) < new Date() && !['已完成', '已取消'].includes(order.status) ? 'text-[#ff858e]' : ''}>{new Date(order.deadline).toLocaleString('zh-CN')}</td><td><span className="work-order-sync"><i className={order.syncStatus === 'synced' ? 'is-synced' : ''} />{order.syncStatus === 'synced' ? '已同步' : '待同步'}</span></td><td><StatusBadge status={order.status} /></td><td><button className="btn-secondary min-h-8 px-2.5 py-1.5">查看处理</button></td></tr>)}</tbody></> : <tbody><tr><td><Empty /></td></tr></tbody>}</DataTable>
    {workOrderId && (detailQuery.isLoading && !selectedDetail ? <Modal title="维修工单详情" onClose={() => navigate('/work-orders')}><Loading /></Modal> : selectedDetail ? <WorkOrderDetail order={selectedDetail} parts={partsQuery.data ?? []} onClose={() => navigate('/work-orders')} /> : <Modal title="维修工单详情" onClose={() => navigate('/work-orders')}><div className="mb-3 text-center text-xs text-[var(--industrial-text-muted)]">工单标识：<span className="industrial-data">{workOrderId}</span></div><ErrorState error={detailQuery.error} retry={() => detailQuery.refetch()} /></Modal>)}
  </div>;
}
