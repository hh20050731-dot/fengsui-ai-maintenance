import { AlertTriangle, CheckCircle2, Info, LoaderCircle, X, XCircle } from 'lucide-react';
import clsx from 'clsx';
import type { PropsWithChildren, ReactNode } from 'react';
import type { RiskLevel } from '@fengsui/shared';

export function RiskBadge({ level }: { level: RiskLevel | string }) {
  const styles: Record<string, string> = { 健康: 'risk-badge--healthy', 关注: 'risk-badge--attention', 二级预警: 'risk-badge--warning', 高风险: 'risk-badge--danger', 离线: 'risk-badge--offline' };
  return <span className={clsx('risk-badge', styles[level] ?? 'risk-badge--offline')}><span />{level}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const done = ['已完成', '已关闭', '充足', '运行'].includes(status); const danger = ['高风险', '缺货', '已取消'].includes(status);
  const warning = ['偏低', '检修', '待验证'].includes(status);
  return <span className={clsx('status-badge', done ? 'is-done' : danger ? 'is-danger' : warning ? 'is-warning' : 'is-neutral')}>{status}</span>;
}

export function Panel({ title, extra, className, children }: PropsWithChildren<{ title?: string; extra?: ReactNode; className?: string }>) {
  return <section className={clsx('panel', className)}>{title && <header className="panel-header"><h2 className="panel-title">{title}</h2>{extra}</header>}{children}</section>;
}

export function Modal({ title, children, onClose, width = 'max-w-2xl' }: PropsWithChildren<{ title: string; onClose: () => void; width?: string }>) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020810]/80 p-4" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <div className={clsx('max-h-[90vh] w-full overflow-hidden rounded-md border border-[var(--industrial-border-strong)] bg-[#071827] shadow-[-4px_0_36px_rgba(0,0,0,0.34)]', width)}>
      <div className="flex items-center justify-between border-b border-[var(--industrial-border)] px-6 py-3.5"><h2 className="font-semibold text-[var(--industrial-text)]">{title}</h2><button className="rounded p-2 text-[var(--industrial-text-muted)] hover:bg-[var(--industrial-primary-soft)] hover:text-[var(--industrial-primary)]" onClick={onClose} aria-label="关闭"><X size={18} /></button></div>
      <div className="scrollbar-thin max-h-[calc(90vh-65px)] overflow-y-auto p-6">{children}</div>
    </div>
  </div>;
}

export function Loading({ label = '正在加载数据…' }: { label?: string }) { return <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-[var(--industrial-text-muted)]"><LoaderCircle className="animate-spin text-[var(--industrial-primary)]" size={18} />{label}</div>; }
export function Empty({ title = '暂无数据', description = '当前筛选条件下没有记录' }: { title?: string; description?: string }) { return <div className="flex min-h-44 flex-col items-center justify-center text-center"><Info className="mb-2 text-[#3f5a70]" /><p className="font-medium text-[var(--industrial-text-secondary)]">{title}</p><p className="mt-1 text-sm text-[var(--industrial-text-muted)]">{description}</p></div>; }
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) { return <div className="flex min-h-44 flex-col items-center justify-center text-center"><XCircle className="mb-2 text-[var(--industrial-danger)]" /><p className="font-medium text-[var(--industrial-text)]">数据加载失败</p><p className="mt-1 text-sm text-[var(--industrial-text-muted)]">{error instanceof Error ? error.message : '请稍后重试'}</p>{retry && <button className="btn-secondary mt-4" onClick={retry}>重新加载</button>}</div>; }

export function DemoDisclaimer({ compact = false }: { compact?: boolean }) { return <div className={clsx('flex items-start gap-2 rounded border border-[rgba(240,168,76,.26)] bg-[var(--industrial-warning-soft)] text-[var(--industrial-text-secondary)]', compact ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm')}><AlertTriangle size={compact ? 15 : 17} className="mt-0.5 shrink-0 text-[var(--industrial-warning)]" /><span><strong className="font-medium text-[var(--industrial-warning)]">当前为模拟演示数据，不代表真实设备诊断结果。</strong>{!compact && ' 规则模型仅用于比赛方案展示。'}</span></div>; }
export function Toast({ message, type = 'success', onClose }: { message: string; type?: 'success' | 'error'; onClose?: () => void }) { return <div className={clsx('fixed bottom-6 right-6 z-[70] flex max-w-sm items-center gap-2 rounded border px-4 py-3 text-sm text-white shadow-[0_8px_24px_rgba(0,0,0,.28)]', type === 'success' ? 'border-[#2f6e62] bg-[#123c35]' : 'border-[#8d3941] bg-[#5c222a]')}>{type === 'success' ? <CheckCircle2 size={17} /> : <XCircle size={17} />}<span>{message}</span>{onClose && <button onClick={onClose}><X size={15} /></button>}</div>; }
