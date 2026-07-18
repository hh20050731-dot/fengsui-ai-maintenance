import { createContext, useContext } from 'react';
import type { User } from '@fengsui/shared';

export interface IntegrationStatus {
  requestedMode: string; effectiveMode: 'mock' | 'feishu'; degraded: boolean; feishuClient: boolean;
  partial?: boolean;
  sso: string; bitable: string; robot: string; aiProvider: string; version: string; lastSyncAt: string; missingConfig: string[];
  capabilities: Record<'equipment' | 'telemetry' | 'health' | 'alerts' | 'workOrders' | 'spareParts' | 'spareTransactions' | 'knowledge' | 'operationLogs', { mode: 'mock' | 'feishu'; configured: boolean }>;
  offlineDemo?: boolean;
}
export const AppContext = createContext<{ user: User; integration?: IntegrationStatus }>({ user: { id: 'demo-user', name: '黄浩', role: '项目演示员', source: 'demo' } });
export const useAppContext = () => useContext(AppContext);
