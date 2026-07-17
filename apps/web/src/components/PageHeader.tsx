import type { ReactNode } from 'react';
export function PageHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><div className="mb-1 text-xs text-[#8F959E]">首页 / {title}</div><h1 className="text-[22px] font-semibold tracking-tight text-[#1F2329]">{title}</h1><p className="mt-1 text-sm text-[#646A73]">{description}</p></div>{actions && <div className="flex flex-wrap gap-2">{actions}</div>}</div>;
}
