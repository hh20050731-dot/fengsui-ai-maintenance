import clsx from 'clsx';
import { AlertTriangle, Check, ChevronRight, CircleDashed, Info, X } from 'lucide-react';
import type { PropsWithChildren, ReactNode } from 'react';
import type { WorkOrderStatus } from '@fengsui/shared';

export function IndustrialPanel({ title, meta, extra, className, children }: PropsWithChildren<{ title?: string; meta?: string; extra?: ReactNode; className?: string }>) {
  return <section className={clsx('industrial-panel', className)}>
    {title && <header className="industrial-panel__header"><div><h2 className="industrial-panel__title">{title}</h2>{meta && <div className="industrial-panel__meta mt-1">{meta}</div>}</div>{extra}</header>}
    {children}
  </section>;
}

export function MetricCard({ label, value, unit, tone = 'default', onClick }: { label: string; value: number | string; unit?: string; tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger'; onClick?: () => void }) {
  const content = <><span className="metric-card__label">{label}</span><span className={clsx('metric-card__value industrial-data', `is-${tone}`)}>{value}{unit && <small>{unit}</small>}</span></>;
  return onClick ? <button className="metric-card" onClick={onClick}>{content}<ChevronRight className="metric-card__arrow" size={14} /></button> : <div className="metric-card">{content}</div>;
}

export function StatusNode({ status, pulse = false, size = 'md' }: { status: '健康' | '关注' | '二级预警' | '高风险' | '离线'; pulse?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  return <span className={clsx('status-node', `is-${status}`, `is-${size}`, pulse && 'industrial-risk-pulse')} aria-label={status} />;
}

export function FlowLine({ className }: { className?: string }) {
  return <span className={clsx('flow-line', className)} aria-hidden="true"><span /></span>;
}

export function AlertBanner({ title, description, tone = 'info', actions }: { title: string; description?: string; tone?: 'info' | 'warning' | 'danger' | 'success'; actions?: ReactNode }) {
  return <div className={clsx('alert-banner', `is-${tone}`)}>{tone === 'danger' || tone === 'warning' ? <AlertTriangle size={17} /> : tone === 'success' ? <Check size={17} /> : <Info size={17} />}<div className="min-w-0 flex-1"><strong>{title}</strong>{description && <span>{description}</span>}</div>{actions}</div>;
}

export function FilterBar({ children, summary }: PropsWithChildren<{ summary?: ReactNode }>) {
  return <div className="filter-bar"><div className="filter-bar__controls">{children}</div>{summary && <div className="filter-bar__summary">{summary}</div>}</div>;
}

export function DataTable({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <div className={clsx('industrial-panel table-wrap', className)}><table className="data-table">{children}</table></div>;
}

export function ChartPanel({ title, meta, extra, className, children }: PropsWithChildren<{ title: string; meta?: string; extra?: ReactNode; className?: string }>) {
  return <IndustrialPanel title={title} meta={meta} extra={extra} className={className}>{children}</IndustrialPanel>;
}

export function DetailDrawer({ title, subtitle, children, footer, onClose }: PropsWithChildren<{ title: string; subtitle?: string; footer?: ReactNode; onClose: () => void }>) {
  return <div className="detail-drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <aside className="detail-drawer" role="dialog" aria-modal="true" aria-label={title}>
      <header className="detail-drawer__header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="detail-drawer__close" onClick={onClose} aria-label="关闭详情"><X size={18} /></button></header>
      <div className="detail-drawer__body scrollbar-thin">{children}</div>
      {footer && <footer className="detail-drawer__footer">{footer}</footer>}
    </aside>
  </div>;
}

const orderStages: WorkOrderStatus[] = ['待接单', '已接单', '检修中', '待验证', '已完成'];

export function WorkOrderRail({ status, counts, onSelect }: { status?: WorkOrderStatus; counts?: Partial<Record<WorkOrderStatus, number>>; onSelect?: (stage: WorkOrderStatus) => void }) {
  const currentIndex = status ? orderStages.indexOf(status) : -1;
  return <div className="work-order-rail" aria-label="工单状态流程">
    <div className="work-order-rail__track" />
    {orderStages.map((stage, index) => {
      const completed = currentIndex >= 0 && index < currentIndex;
      const active = status === stage;
      const content = <><span className={clsx('work-order-rail__node', completed && 'is-completed', active && 'is-active')}>{completed ? <Check size={14} /> : active ? <span /> : <CircleDashed size={15} />}</span><span className="work-order-rail__label">{stage}</span>{counts && <span className="work-order-rail__count industrial-data">{counts[stage] ?? 0}</span>}</>;
      return onSelect ? <button key={stage} className="work-order-rail__stage" onClick={() => onSelect(stage)}>{content}</button> : <div key={stage} className="work-order-rail__stage">{content}</div>;
    })}
  </div>;
}

export function Timeline({ items }: { items: Array<{ id: string; title: string; time: string; detail?: string; operator?: string }> }) {
  return <div className="industrial-timeline">{items.map((item, index) => <div className="industrial-timeline__item" key={item.id}><span className={clsx('industrial-timeline__node', index === 0 && 'is-current')} /><div className="flex items-start justify-between gap-3"><strong>{item.title}</strong><time className="industrial-data">{item.time}</time></div>{item.detail && <p>{item.detail}</p>}{item.operator && <small>操作人：{item.operator}</small>}</div>)}</div>;
}
