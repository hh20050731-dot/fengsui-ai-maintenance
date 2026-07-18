import {
  AlertTriangle, Bell, BookOpen, Boxes, Box, ChevronLeft, ChevronRight, ClipboardList, Gauge,
  Menu, PackageSearch, Settings, Wrench, X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { detectFeishuEnvironment } from '../feishu/adapter';
import { useAppContext } from '../contexts/AppContext';

const navigation = [
  { to: '/', label: '设备总览', icon: Gauge }, { to: '/equipment', label: '设备台账', icon: Boxes },
  { to: '/digital-twin', label: '3D数字孪生', icon: Box },
  { to: '/alerts', label: '预警中心', icon: AlertTriangle }, { to: '/ai', label: '辅助研判', icon: BookOpen },
  { to: '/work-orders', label: '维修工单', icon: ClipboardList }, { to: '/spare-parts', label: '备件库存', icon: PackageSearch },
  { to: '/knowledge', label: '运维知识库', icon: Wrench }, { to: '/settings', label: '系统设置', icon: Settings },
];

export function MainLayout() {
  const [collapsed, setCollapsed] = useState(false); const [mobileOpen, setMobileOpen] = useState(false);
  const [clock, setClock] = useState(new Date()); const location = useLocation(); const { user, integration } = useAppContext();
  useEffect(() => { const timer = window.setInterval(() => setClock(new Date()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => setMobileOpen(false), [location.pathname]);
  const sidebar = <aside className={clsx('flex h-full flex-col border-r border-[#E5E6EB] bg-white text-[#1F2329] transition-all', collapsed ? 'w-[68px]' : 'w-[216px]')}>
    <div className={clsx('flex h-14 items-center border-b border-[#E5E6EB]', collapsed ? 'justify-center px-2' : 'px-5')}><div><div className={clsx('font-semibold tracking-[.16em] text-[#1F2329]', collapsed ? 'text-base' : 'text-lg')}>{collapsed ? '烽' : '烽燧'}</div>{!collapsed && <div className="mt-0.5 text-[10px] text-[#8F959E]">设备运维管理</div>}</div></div>
    <nav className="flex-1 space-y-1 px-2 py-4">{navigation.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} title={collapsed ? label : undefined} className={({ isActive }) => clsx('relative flex h-10 items-center gap-3 rounded px-3 text-sm transition-colors', isActive ? 'bg-[#F2F3F5] font-medium text-[#1F2329] before:absolute before:left-0 before:h-5 before:w-[3px] before:rounded-r before:bg-[#4E5969]' : 'text-[#646A73] hover:bg-[#F7F7F7] hover:text-[#1F2329]', collapsed && 'justify-center px-2')}><Icon size={18} strokeWidth={1.7} />{!collapsed && <span>{label}</span>}</NavLink>)}</nav>
    <div className="border-t border-[#E5E6EB] p-2"><button className="flex h-9 w-full items-center justify-center rounded text-[#646A73] hover:bg-[#F2F3F5]" onClick={() => setCollapsed(!collapsed)}>{collapsed ? <ChevronRight size={17} /> : <><ChevronLeft size={17} /><span className="ml-2 text-xs">收起导航</span></>}</button></div>
  </aside>;
  return <div className="flex min-h-screen bg-[#F7F7F7]">
    <div className="desktop-only fixed inset-y-0 left-0 z-30">{sidebar}</div>
    {mobileOpen && <div className="fixed inset-0 z-50 bg-slate-950/30 lg:hidden" onClick={() => setMobileOpen(false)}><div className="h-full w-[232px]" onClick={(event) => event.stopPropagation()}>{sidebar}</div><button className="absolute right-4 top-4 rounded-full bg-white p-2"><X size={18} /></button></div>}
    <div className={clsx('min-w-0 flex-1 transition-all', collapsed ? 'lg:ml-[68px]' : 'lg:ml-[216px]')}>
      <header className="sticky top-0 z-20 border-b border-[#E5E6EB] bg-white">
        <div className="flex h-14 items-center justify-between gap-3 px-4 lg:px-5"><div className="flex min-w-0 items-center gap-3"><button className="rounded p-2 text-[#646A73] hover:bg-[#F2F3F5] lg:hidden" onClick={() => setMobileOpen(true)}><Menu size={19} /></button><div className="min-w-0"><div className="truncate text-sm font-medium text-[#1F2329]">华东示范垃圾焚烧发电厂</div><div className="mt-0.5 flex items-center gap-2 text-[10px] text-[#8F959E]"><span>数据更新 {new Date(integration?.lastSyncAt ?? Date.now()).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span><span>·</span><span>{clock.toLocaleString('zh-CN', { hour12: false })}</span></div></div></div>
          <div className="flex items-center gap-2 sm:gap-3"><span className="hidden rounded bg-[#F2F3F5] px-2 py-1 text-[11px] font-medium text-orange-700 sm:inline-flex">模拟演示数据</span><span className="hidden items-center gap-1.5 text-[11px] text-[#646A73] md:flex"><span className={clsx('h-1.5 w-1.5 rounded-full', integration?.effectiveMode === 'feishu' ? 'bg-emerald-600' : 'bg-[#8F959E]')} />{integration?.effectiveMode === 'feishu' ? '飞书已连接' : integration?.offlineDemo ? '离线演示模式' : `演示模式${detectFeishuEnvironment().inClient ? ' · 客户端内' : ''}`}</span><button className="relative rounded p-2 text-[#646A73] hover:bg-[#F2F3F5]" aria-label="通知"><Bell size={18} /><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-red-500" /></button><div className="flex items-center gap-2 border-l border-[#E5E6EB] pl-3"><div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E5E6EB] text-xs font-semibold text-[#4E5969]">{user.name.slice(0, 1)}</div><div className="hidden sm:block"><div className="text-xs font-medium text-[#3A3F47]">{user.name}</div><div className="text-[10px] text-[#8F959E]">{user.role}</div></div></div></div></div>
      </header>
      <main className="mx-auto max-w-[1680px] p-4 lg:p-5"><Outlet /></main>
      <footer className="px-6 pb-5 text-center text-[11px] text-[#8F959E]">烽燧 v1.0.1 · 比赛演示规则模型 · 生产应用需结合安全规程与专业人员判断</footer>
    </div>
  </div>;
}
