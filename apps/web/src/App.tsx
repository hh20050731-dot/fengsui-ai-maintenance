import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { User } from '@fengsui/shared';
import { api } from './services/api';
import { AppContext, type IntegrationStatus } from './contexts/AppContext';
import { loginWithFeishu } from './feishu/adapter';
import { MainLayout } from './layouts/MainLayout';
import { DashboardPage } from './pages/DashboardPage';
import { EquipmentPage } from './pages/EquipmentPage';
import { EquipmentDetailPage } from './pages/EquipmentDetailPage';
import { AlertsPage } from './pages/AlertsPage';
import { AiAssistantPage } from './pages/AiAssistantPage';
import { WorkOrdersPage } from './pages/WorkOrdersPage';
import { SparePartsPage } from './pages/SparePartsPage';
import { KnowledgePage } from './pages/KnowledgePage';
import { SettingsPage } from './pages/SettingsPage';
import { Loading } from './components/ui';

const DigitalTwinPage = lazy(() => import('./pages/DigitalTwinPage').then((module) => ({ default: module.DigitalTwinPage })));

const client = new QueryClient({ defaultOptions: { queries: { staleTime: 20_000, retry: 1 }, mutations: { retry: 0 } } });

function AppRoutes() {
  const queryClient = useQueryClient();
  const userQuery = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/auth/me') });
  const integrationQuery = useQuery({ queryKey: ['integration'], queryFn: () => api<IntegrationStatus>('/integration/status') });
  useEffect(() => { loginWithFeishu().then((user) => user && queryClient.setQueryData(['me'], user)).catch((error) => console.warn('[feishu-login] 免登未完成，继续使用演示身份：', error instanceof Error ? error.message : error)); }, [queryClient]);
  if (userQuery.isLoading) return <Loading label="正在进入烽燧系统…" />;
  const user = userQuery.data ?? { id: 'demo-user', name: '黄浩', role: '项目演示员', source: 'demo' as const };
  return <AppContext.Provider value={{ user, integration: integrationQuery.data }}><Routes><Route element={<MainLayout />}><Route index element={<DashboardPage />} /><Route path="equipment" element={<EquipmentPage />} /><Route path="equipment/:deviceId" element={<EquipmentDetailPage />} /><Route path="digital-twin" element={<Suspense fallback={<Loading label="正在加载3D数字孪生模块…" />}><DigitalTwinPage /></Suspense>} /><Route path="alerts" element={<AlertsPage />} /><Route path="alerts/:alertId" element={<AlertsPage />} /><Route path="ai" element={<AiAssistantPage />} /><Route path="work-orders" element={<WorkOrdersPage />} /><Route path="work-orders/:workOrderId" element={<WorkOrdersPage />} /><Route path="spare-parts" element={<SparePartsPage />} /><Route path="knowledge" element={<KnowledgePage />} /><Route path="settings" element={<SettingsPage />} /><Route path="*" element={<Navigate to="/" replace />} /></Route></Routes></AppContext.Provider>;
}

export default function App() { return <QueryClientProvider client={client}><BrowserRouter><AppRoutes /></BrowserRouter></QueryClientProvider>; }
