import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardPlus, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Alert, WorkOrder } from '@fengsui/shared';
import { api, idempotencyKey, postJson } from '../../../services/api';
import type { FaultScenario } from '../digitalTwinTypes';

export function WorkOrderButton({ scenario, deviceId, deviceName }: { scenario: FaultScenario; deviceId: string; deviceName: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const alertsQuery = useQuery({ queryKey: ['alerts', 'digital-twin', deviceId], queryFn: () => api<Alert[]>(`/alerts?deviceId=${encodeURIComponent(deviceId)}`) });
  const alert = alertsQuery.data?.find((item) => !['已关闭', '误报'].includes(item.alertStatus)) ?? alertsQuery.data?.[0];
  const createOrder = useMutation({
    mutationFn: () => postJson<WorkOrder>(`/alerts/${alert!.alertId}/create-work-order`, {
      assignee: '张工', assigneeUserId: 'zhang-gong', idempotencyKey: idempotencyKey(`digital-twin-${scenario.id}`),
      digitalTwinContext: {
        equipmentName: deviceName, equipmentId: deviceId, faultPart: scenario.faultPart, faultType: scenario.name,
        riskLevel: scenario.risk, failureProbability: scenario.probability, healthScore: scenario.health,
        temperature: scenario.sensors.temperature, vibration: scenario.sensors.vibration, speed: scenario.sensors.speed,
        current: scenario.sensors.current, diagnosis: scenario.diagnosis, advice: scenario.advice, createdAt: new Date().toISOString(),
      },
    }),
    onSuccess: async (order) => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['alerts'] }), queryClient.invalidateQueries({ queryKey: ['work-orders'] })]);
      navigate(`/work-orders/${order.workOrderId}`);
    },
  });
  const relatedOrderId = alert?.relatedWorkOrderId;
  const disabledReason = scenario.id === 'normal' ? '正常运行场景无需生成工单' : alertsQuery.isLoading ? '正在读取关联预警' : !alert ? '当前没有可关联的设备预警' : '';
  if (relatedOrderId) return <button type="button" className="btn-primary mt-4 w-full" onClick={() => navigate(`/work-orders/${relatedOrderId}`)}><ExternalLink size={15} />查看关联工单</button>;
  return <div className="mt-4"><button type="button" className="btn-primary w-full" disabled={Boolean(disabledReason) || createOrder.isPending} title={disabledReason || undefined} onClick={() => createOrder.mutate()}><ClipboardPlus size={15} />{createOrder.isPending ? '正在生成…' : '生成运维工单'}</button>{disabledReason && <div className="mt-1.5 text-center text-[11px] text-[#8F959E]">{disabledReason}</div>}{createOrder.isError && <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{createOrder.error.message}</div>}</div>;
}
