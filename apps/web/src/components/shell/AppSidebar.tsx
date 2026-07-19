import {
  AlertTriangle, BookOpen, Boxes, Box, ChevronLeft, ChevronRight, ClipboardList, Gauge,
  PackageSearch, Settings, Sparkles, Wrench,
} from 'lucide-react';
import clsx from 'clsx';
import { NavLink } from 'react-router-dom';

const navigation = [
  { to: '/', label: '设备总览', icon: Gauge },
  { to: '/equipment', label: '设备台账', icon: Boxes },
  { to: '/digital-twin', label: '3D数字孪生', icon: Box },
  { to: '/alerts', label: '预警中心', icon: AlertTriangle },
  { to: '/ai', label: '辅助研判', icon: BookOpen },
  { to: '/work-orders', label: '维修工单', icon: ClipboardList },
  { to: '/spare-parts', label: '备件库存', icon: PackageSearch },
  { to: '/knowledge', label: '运维知识库', icon: Wrench },
  { to: '/capabilities', label: '六大能力映射', icon: Sparkles },
  { to: '/settings', label: '系统设置', icon: Settings },
];

export function AppSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return <aside className={clsx('app-sidebar', collapsed ? 'is-collapsed' : 'is-expanded')}>
    <div className="app-sidebar__brand">
      <div className="app-sidebar__mark" aria-hidden="true"><span /><span /><span /></div>
      {!collapsed && <div><strong>烽燧智守</strong><small>设备智能运维指挥系统</small></div>}
    </div>
    <nav className="app-sidebar__nav" aria-label="主导航">
      {navigation.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} title={collapsed ? label : undefined} className={({ isActive }) => clsx('app-sidebar__item', isActive && 'is-active')}>
        <Icon size={18} strokeWidth={1.65} />{!collapsed && <span>{label}</span>}
      </NavLink>)}
    </nav>
    <div className="app-sidebar__footer">
      <button onClick={onToggle} aria-label={collapsed ? '展开导航' : '收起导航'}>{collapsed ? <ChevronRight size={17} /> : <><ChevronLeft size={17} /><span>收起导航</span></>}</button>
    </div>
  </aside>;
}
