import type { ReactNode } from 'react';
export function PageHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return <div className="mb-4 flex flex-col justify-between gap-3 border-b border-[var(--industrial-border)] pb-4 sm:flex-row sm:items-end"><div><div className="mb-1 text-[10px] text-[var(--industrial-text-muted)]">烽燧智守 / {title}</div><h1 className="text-[22px] font-semibold tracking-tight text-[var(--industrial-text)]">{title}</h1><p className="mt-1 text-[13px] text-[var(--industrial-text-secondary)]">{description}</p></div>{actions && <div className="flex flex-wrap gap-2">{actions}</div>}</div>;
}
