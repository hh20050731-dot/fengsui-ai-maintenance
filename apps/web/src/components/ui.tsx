import { AlertTriangle, CheckCircle2, Info, LoaderCircle, X, XCircle } from 'lucide-react';
import clsx from 'clsx';
import type { PropsWithChildren, ReactNode } from 'react';
import type { RiskLevel } from '@fengsui/shared';

export function RiskBadge({ level }: { level: RiskLevel | string }) {
  const styles: Record<string, string> = { 健康: 'border-emerald-200 bg-emerald-50 text-emerald-700', 关注: 'border-slate-300 bg-slate-100 text-slate-600', 二级预警: 'border-orange-200 bg-orange-50 text-orange-700', 高风险: 'border-red-200 bg-red-50 text-red-700', 离线: 'border-slate-300 bg-slate-100 text-slate-600' };
  return <span className={clsx('inline-flex whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium', styles[level] ?? 'border-slate-300 bg-slate-100 text-slate-600')}>{level}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const done = ['已完成', '已关闭', '充足'].includes(status); const danger = ['高风险', '缺货', '已取消'].includes(status);
  return <span className={clsx('inline-flex whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium', done ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : danger ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 bg-slate-100 text-slate-700')}>{status}</span>;
}

export function Panel({ title, extra, className, children }: PropsWithChildren<{ title?: string; extra?: ReactNode; className?: string }>) {
  return <section className={clsx('panel', className)}>{title && <header className="panel-header"><h2 className="panel-title">{title}</h2>{extra}</header>}{children}</section>;
}

export function Modal({ title, children, onClose, width = 'max-w-2xl' }: PropsWithChildren<{ title: string; onClose: () => void; width?: string }>) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <div className={clsx('max-h-[90vh] w-full overflow-hidden rounded border border-[#D9DADC] bg-white shadow-[0_8px_24px_rgba(31,35,41,0.10)]', width)}>
      <div className="flex items-center justify-between border-b border-[#E5E6EB] px-6 py-3.5"><h2 className="font-semibold text-[#1F2329]">{title}</h2><button className="rounded p-2 text-[#646A73] hover:bg-[#F2F3F5]" onClick={onClose} aria-label="关闭"><X size={18} /></button></div>
      <div className="scrollbar-thin max-h-[calc(90vh-65px)] overflow-y-auto p-6">{children}</div>
    </div>
  </div>;
}

export function Loading({ label = '正在加载数据…' }: { label?: string }) { return <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={18} />{label}</div>; }
export function Empty({ title = '暂无数据', description = '当前筛选条件下没有记录' }: { title?: string; description?: string }) { return <div className="flex min-h-44 flex-col items-center justify-center text-center"><Info className="mb-2 text-slate-300" /><p className="font-medium text-slate-600">{title}</p><p className="mt-1 text-sm text-slate-400">{description}</p></div>; }
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) { return <div className="flex min-h-44 flex-col items-center justify-center text-center"><XCircle className="mb-2 text-red-400" /><p className="font-medium text-slate-700">数据加载失败</p><p className="mt-1 text-sm text-slate-500">{error instanceof Error ? error.message : '请稍后重试'}</p>{retry && <button className="btn-secondary mt-4" onClick={retry}>重新加载</button>}</div>; }

export function DemoDisclaimer({ compact = false }: { compact?: boolean }) { return <div className={clsx('flex items-start gap-2 rounded border border-[#E5E6EB] bg-[#FAFAFA] text-[#646A73]', compact ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm')}><AlertTriangle size={compact ? 15 : 17} className="mt-0.5 shrink-0 text-orange-600" /><span><strong className="font-medium text-orange-700">当前为模拟演示数据，不代表真实设备诊断结果。</strong>{!compact && ' 规则模型仅用于比赛方案展示。'}</span></div>; }
export function Toast({ message, type = 'success', onClose }: { message: string; type?: 'success' | 'error'; onClose?: () => void }) { return <div className={clsx('fixed bottom-6 right-6 z-[70] flex max-w-sm items-center gap-2 rounded border px-4 py-3 text-sm text-white shadow-[0_6px_18px_rgba(31,35,41,0.12)]', type === 'success' ? 'border-slate-700 bg-slate-700' : 'border-red-700 bg-red-700')}>{type === 'success' ? <CheckCircle2 size={17} /> : <XCircle size={17} />}<span>{message}</span>{onClose && <button onClick={onClose}><X size={15} /></button>}</div>; }
