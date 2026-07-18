import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardPlus, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import type { Alert, WorkOrder } from '@fengsui/shared';
import { api, idempotencyKey, postJson } from '../../../services/api';
import type { FaultScenario } from '../digitalTwinTypes';
import { canCreateWorkOrderForScenario } from '../faultScenarios';

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
  const workOrderEnabled = canCreateWorkOrderForScenario(scenario.id);
  const disabledReason = !workOrderEnabled ? '正常运行场景无需生成工单' : alertsQuery.isLoading ? '正在读取关联预警' : !alert ? '当前没有可关联的设备预警' : '';
  if (relatedOrderId) return <button type="button" className="twin-order-button twin-order-action" onClick={() => navigate(`/work-orders/${relatedOrderId}`)}><ExternalLink size={15} />查看关联工单</button>;
  if (!workOrderEnabled) return <div className="twin-order-help twin-order-action">当前运行状态正常，无需创建维修工单。</div>;
  return <div className="twin-order-action"><button type="button" className={clsx('twin-order-button', scenario.risk === '高' && 'is-danger')} disabled={Boolean(disabledReason) || createOrder.isPending} title={disabledReason || undefined} onClick={() => createOrder.mutate()}><ClipboardPlus size={15} />{createOrder.isPending ? '正在生成…' : '生成维修工单'}</button>{disabledReason && <div className="twin-order-help">{disabledReason}</div>}{createOrder.isError && <div className="twin-order-error">{createOrder.error.message}</div>}</div>;
}
