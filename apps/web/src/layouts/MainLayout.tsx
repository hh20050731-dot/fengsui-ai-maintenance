import { X } from 'lucide-react';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AppSidebar } from '../components/shell/AppSidebar';
import { TopStatusBar } from '../components/shell/TopStatusBar';
import { useAppContext } from '../contexts/AppContext';
import '../components/shell/shell.css';

export function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [clock, setClock] = useState(new Date());
  const location = useLocation();
  const { user, integration } = useAppContext();

  useEffect(() => { const timer = window.setInterval(() => setClock(new Date()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => {
    const syncNavigation = () => setCollapsed(window.innerWidth < 1500);
    syncNavigation();
    window.addEventListener('resize', syncNavigation);
    return () => window.removeEventListener('resize', syncNavigation);
  }, []);

  return <div className="min-h-screen bg-[var(--industrial-bg)]">
    <div className="desktop-only fixed inset-y-0 left-0 z-30"><AppSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} /></div>
    {mobileOpen && <div className="fixed inset-0 z-50 bg-[#020810]/80 lg:hidden" onClick={() => setMobileOpen(false)}><div className="h-full w-[232px]" onClick={(event) => event.stopPropagation()}><AppSidebar collapsed={false} onToggle={() => setMobileOpen(false)} /></div><button className="absolute right-4 top-4 rounded border border-[var(--industrial-border)] bg-[var(--industrial-surface)] p-2 text-[var(--industrial-text-secondary)]" onClick={() => setMobileOpen(false)} aria-label="关闭导航"><X size={18} /></button></div>}
    <div className={clsx('min-w-0 transition-[margin] duration-200', collapsed ? 'lg:ml-[72px]' : 'lg:ml-[220px]')}>
      <div className="sticky top-0 z-20"><TopStatusBar clock={clock} user={user} integration={integration} onOpenMenu={() => setMobileOpen(true)} /></div>
      <main className="mx-auto min-h-[calc(100vh-104px)] max-w-[1920px] p-4 lg:p-5"><Outlet /></main>
      <footer className="px-6 pb-4 text-center text-[10px] text-[var(--industrial-text-muted)]">烽燧智守 v1.0.2 · 比赛演示规则模型 · 生产应用需结合安全规程与专业人员判断</footer>
    </div>
  </div>;
}
