import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, RotateCcw, Send } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { DemoDisclaimer, ErrorState, Loading, Modal, Panel, StatusBadge, Toast } from '../components/ui';
import { detectFeishuEnvironment } from '../feishu/adapter';
import { api, postJson, resetDemoState } from '../services/api';
import type { IntegrationStatus } from '../contexts/AppContext';

interface NotificationResult { messageId: string; delivered: boolean; preview: Record<string, unknown>; error?: string }
export function SettingsPage() {
  const queryClient = useQueryClient(); const [preview, setPreview] = useState<NotificationResult | null>(null); const [toast, setToast] = useState('');
  const query = useQuery({ queryKey: ['integration'], queryFn: () => api<IntegrationStatus>('/integration/status') });
  const health = useMutation({ mutationFn: () => api<{ status: string; version: string; mode: string; time: string }>('/health'), onSuccess: (data) => setToast(`服务连接正常 · ${data.mode} 模式 · v${data.version}`) });
  const notify = useMutation({ mutationFn: () => postJson<NotificationResult>('/notifications/test', {}), onSuccess: setPreview });
  const resetDemo = useMutation({ mutationFn: resetDemoState, onSuccess: () => { queryClient.clear(); window.location.assign('/'); } });
  const handleReset = () => {
    if (!window.confirm('第一次确认：重置将清除本浏览器中的全部比赛演示进度，是否继续？')) return;
    if (!window.confirm('第二次确认：1号引风机将恢复为健康度68、原始预警和初始库存。确认重置？')) return;
    resetDemo.mutate();
  };
  if (query.isLoading) return <Loading />; if (query.isError || !query.data) return <ErrorState error={query.error} />;
  const status = query.data; const envState = detectFeishuEnvironment();
  const items = [
    { label: '当前运行模式', value: status.effectiveMode === 'feishu' ? '飞书数据模式' : status.offlineDemo ? '离线演示模式（浏览器本地）' : '模拟演示模式', ok: true },
    { label: '飞书客户端检测', value: envState.inClient ? '已检测到飞书客户端' : '普通浏览器环境', ok: envState.inClient },
    { label: '免登状态', value: status.sso, ok: status.effectiveMode === 'feishu' ? status.sso !== '等待端内登录' : true },
    { label: '多维表格连接', value: status.bitable, ok: status.effectiveMode === 'feishu' ? status.bitable === '已配置' : true },
    { label: '机器人连接', value: status.robot, ok: status.effectiveMode === 'feishu' ? status.robot === '已配置' : true },
    { label: '研判方式', value: status.aiProvider.toLowerCase().includes('rule') ? '规则库（演示）' : status.aiProvider, ok: true },
    { label: '演示数据保存', value: status.effectiveMode === 'mock' ? '当前浏览器本地持久化' : '飞书多维表格', ok: true },
  ];
  return <div><PageHeader title="系统设置" description="查看运行模式、飞书集成状态、连接能力与缺失配置" actions={<><button className="btn-secondary" onClick={() => { query.refetch(); queryClient.invalidateQueries({ queryKey: ['integration'] }); }}><RefreshCw size={15} />刷新状态</button><button className="btn-primary" onClick={() => health.mutate()} disabled={health.isPending}>测试连接</button></>} /><DemoDisclaimer compact />
    {status.offlineDemo ? <div className="mt-4 rounded border border-[#D9DADC] bg-[#FAFAFA] p-4 text-sm text-[#646A73]"><strong className="text-[#1F2329]">浏览器离线演示：</strong>后端接口当前不可用或已强制启用静态演示，设备、预警、工单与库存由本浏览器本地数据适配器提供并持久化。不会请求飞书真实数据或发送真实消息。</div> : status.partial ? <div className="mt-4 rounded border border-[#D9DADC] bg-[#FAFAFA] p-4 text-sm text-[#646A73]"><strong className="text-[#1F2329]">飞书已部分启用：</strong>维修工单使用飞书，未配置模块继续使用Mock。</div> : status.degraded && <div className="mt-4 rounded border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800"><strong>已安全降级：</strong>飞书客户端基础配置不完整，当前使用 Mock 模式。</div>}
    <div className="panel mt-4 grid md:grid-cols-2 xl:grid-cols-3">{items.map(({ label, value, ok }) => <div key={label} className="flex min-w-0 items-center justify-between border-b border-r border-[#EDEEF0] px-5 py-4"><div className="min-w-0"><div className="text-xs text-[#8F959E]">{label}</div><div className="mt-1 truncate text-sm font-medium text-[#1F2329]">{value}</div></div><span className={`ml-4 h-2 w-2 shrink-0 rounded-full ${ok ? 'bg-[#7FA58A]' : 'bg-[#B7BBC1]'}`} aria-label={ok ? '状态正常' : '未连接'} /></div>)}</div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2"><Panel title="集成概况"><div className="space-y-3 p-5 text-sm">{([['请求模式', status.requestedMode], ['生效模式', status.effectiveMode], ['当前版本', status.version], ['最近同步', new Date(status.lastSyncAt).toLocaleString('zh-CN')], ['JSSDK 状态', envState.sdkReady ? '已就绪' : '普通浏览器无 JSSDK（符合预期）']] as Array<[string, string]>).map(([label, value]) => <div key={label} className="flex items-center justify-between border-b border-[#EDEEF0] pb-3"><span className="text-[#646A73]">{label}</span><StatusBadge status={value} /></div>)}</div></Panel><Panel title="缺失配置项" extra={<span className="text-xs text-[#8F959E]">前端不显示 Secret 或完整令牌</span>}><div className="p-5">{status.missingConfig.length ? <div className="flex flex-wrap gap-2">{status.missingConfig.map((item) => <span key={item} className="rounded bg-[#F2F3F5] px-3 py-2 font-mono text-xs text-[#646A73]">{item}</span>)}</div> : <div className="rounded border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">飞书真实模式必要配置已齐全</div>}<p className="mt-4 text-xs leading-5 text-[#646A73]">配置变量仅由服务端读取；`VITE_` 前缀只允许放公开的 App ID 和 API 地址。具体来源见 README 与配置文档。</p></div></Panel></div>
    <Panel title="机器人消息测试" className="mt-4" extra={<button className="btn-primary min-h-8 py-1.5" onClick={() => notify.mutate()} disabled={notify.isPending}><Send size={14} />发送测试消息</button>}><div className="p-5 text-sm leading-6 text-slate-600">Mock 模式会展示飞书消息卡片预览，不会向真实群聊发送；Feishu 模式使用服务端应用机器人和配置的会话 ID 发送。消息失败不会回滚业务写入，可再次点击重试。</div></Panel>
    {(status.requestedMode === 'mock' || status.offlineDemo) && <Panel title="比赛演示数据" className="mt-4" extra={<button data-testid="reset-demo-data" className="btn-danger min-h-8 py-1.5" onClick={handleReset} disabled={resetDemo.isPending}><RotateCcw size={14} />{resetDemo.isPending ? '正在重置…' : '重置演示数据'}</button>}><div className="p-5 text-sm leading-6 text-[#646A73]">工单进度、维修记录、设备健康度、预警状态、库存变化和知识库候选案例保存在当前浏览器。重置只影响本浏览器的 Mock 演示数据，不会修改飞书真实数据。</div></Panel>}
    {preview && <Modal title="机器人消息卡片预览" onClose={() => setPreview(null)}><div className="overflow-hidden rounded border border-[#D9DADC]"><div className="border-t-[3px] border-[#66788A] bg-[#FAFAFA] px-5 py-4 font-semibold">{String((preview.preview.header as any)?.title?.content ?? '烽燧测试消息')}</div><div className="p-5 text-sm leading-6 text-[#646A73]">{String(((preview.preview.elements as any[])?.[0]?.content ?? '连接测试成功')).split('\n').map((line) => <div key={line}>{line.replaceAll('**', '')}</div>)}</div></div><div className="mt-4 flex items-center gap-2 text-sm"><StatusBadge status={preview.delivered ? '预览成功' : '发送失败'} />{preview.error && <span className="text-red-600">{preview.error}</span>}</div></Modal>}{toast && <Toast message={toast} onClose={() => setToast('')} />}{(health.isError || notify.isError || resetDemo.isError) && <Toast type="error" message={(health.error ?? notify.error ?? resetDemo.error)?.message ?? '操作失败'} onClose={() => { health.reset(); notify.reset(); resetDemo.reset(); }} />}
  </div>;
}
