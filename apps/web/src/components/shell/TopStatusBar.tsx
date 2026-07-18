import { Bell, Menu } from 'lucide-react';
import clsx from 'clsx';
import type { User } from '@fengsui/shared';
import type { IntegrationStatus } from '../../contexts/AppContext';
import { detectFeishuEnvironment } from '../../feishu/adapter';

export function TopStatusBar({ clock, user, integration, onOpenMenu }: { clock: Date; user: User; integration?: IntegrationStatus; onOpenMenu: () => void }) {
  const connected = integration?.effectiveMode === 'feishu';
  const connectionText = connected ? integration?.partial ? '飞书部分能力已连接' : '飞书数据已连接' : integration?.offlineDemo ? '离线演示模式' : `演示模式${detectFeishuEnvironment().inClient ? ' · 飞书客户端' : ''}`;
  return <header className="top-status-bar">
    <div className="top-status-bar__station">
      <button className="top-status-bar__menu" onClick={onOpenMenu} aria-label="打开导航"><Menu size={19} /></button>
      <div><strong>华东示范垃圾焚烧发电厂</strong><span><i className="top-status-bar__online" />场站运行监测中</span></div>
    </div>
    <div className="top-status-bar__telemetry industrial-data">
      <span>数据更新 {new Date(integration?.lastSyncAt ?? Date.now()).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
      <span>{clock.toLocaleString('zh-CN', { hour12: false })}</span>
    </div>
    <div className="top-status-bar__actions">
      <span className="top-status-bar__demo">模拟演示数据</span>
      <span className="top-status-bar__connection"><i className={clsx(connected ? 'is-connected' : 'is-demo')} />{connectionText}</span>
      <button className="top-status-bar__bell" aria-label="通知"><Bell size={18} /><i /></button>
      <div className="top-status-bar__user"><span>{user.name.slice(0, 1)}</span><div><strong>{user.name}</strong><small>{user.role}</small></div></div>
    </div>
  </header>;
}
