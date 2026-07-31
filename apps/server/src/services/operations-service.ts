import { randomUUID } from 'node:crypto';
import {
  assertWorkOrderTransition, getDiagnosisIntentRoute, getStockStatus, getWorkOrderNo, getWorkOrderTransitionIdentifier, resolveDiagnosisDevice, type AiDiagnosis, type CreateWorkOrderInput, type DashboardData, type Equipment, type KnowledgeEntry, type RuleDiagnosisContext, type SparePartUsage,
  type TelemetryPoint, type WorkOrder, type WorkOrderStatus,
} from '@fengsui/shared';
import { AppError } from '../middleware/errors.js';
import type { AiDiagnosisProvider } from '../providers/ai-diagnosis-provider.js';
import {
  buildHighRiskWorkOrderCard,
  type NotificationProvider,
  type NotificationResult,
} from '../providers/notification-provider.js';
import type { DataRepository } from '../repositories/data-repository.js';

export class OperationsService {
  private idempotency = new Map<string, unknown>();
  constructor(
    public repository: DataRepository,
    private ai: AiDiagnosisProvider,
    private notifications: NotificationProvider,
    private options: { createKnowledgeCandidates?: boolean } = {},
  ) {}

  resetTransientState() { this.idempotency.clear(); }

  async dashboard(range = '24h'): Promise<DashboardData> {
    const [equipment, alerts, orders, parts] = await Promise.all([this.repository.listEquipment(), this.repository.listAlerts(), this.repository.listWorkOrders(), this.repository.listSpareParts()]);
    const telemetry = (await Promise.all(equipment.map((item) => this.repository.getTelemetry(item.deviceId)))).flat();
    const rangeHours = range === '30d' ? 720 : range === '7d' ? 168 : 24;
    const bucketMs = (range === '30d' ? 24 : range === '7d' ? 6 : 1) * 3_600_000;
    const buckets = new Map<number, number[]>();
    telemetry.filter((point) => Date.now() - new Date(point.timestamp).getTime() <= rangeHours * 3_600_000).forEach((point) => {
      const bucket = Math.floor(new Date(point.timestamp).getTime() / bucketMs) * bucketMs;
      buckets.set(bucket, [...(buckets.get(bucket) ?? []), point.healthScore]);
    });
    const healthTrend = [...buckets.entries()].sort(([a], [b]) => a - b).map(([time, scores]) => ({ time: new Date(time).toISOString(), health: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) }));
    const indicators = alerts.flatMap((alert) => alert.abnormalIndicators);
    const abnormalDistribution = [...new Set(indicators)].map((name) => ({ name, value: indicators.filter((item) => item === name).length }));
    const areas = [...new Set(equipment.map((item) => item.systemArea))];
    return {
      statistics: {
        total: equipment.length, healthy: equipment.filter((item) => item.riskLevel === '健康').length,
        attention: equipment.filter((item) => item.riskLevel === '关注').length,
        warning: equipment.filter((item) => item.riskLevel === '二级预警').length,
        highRisk: equipment.filter((item) => item.riskLevel === '高风险').length,
        todayAlerts: alerts.filter((item) => Date.now() - new Date(item.alertTime).getTime() < 86_400_000).length,
        pendingOrders: orders.filter((item) => !['已完成', '已取消'].includes(item.status)).length,
        lowStock: parts.filter((item) => item.stockStatus !== '充足').length,
      },
      equipment, recentAlerts: alerts.slice().sort((a, b) => b.alertTime.localeCompare(a.alertTime)).slice(0, 5),
      pendingWorkOrders: orders.filter((item) => !['已完成', '已取消'].includes(item.status)).slice(0, 5),
      healthTrend, abnormalDistribution,
      areaDistribution: areas.map((area) => ({ area, healthy: equipment.filter((item) => item.systemArea === area && item.riskLevel === '健康').length, risk: equipment.filter((item) => item.systemArea === area && item.riskLevel !== '健康').length })),
    };
  }

  async diagnose(selectedDeviceId: string | undefined, question: string): Promise<AiDiagnosis> {
    const route = getDiagnosisIntentRoute(question, selectedDeviceId);
    const intent = route.intent;
    if (intent === 'CREATE_DEMO_WORK_ORDER') {
      throw new AppError(400, 'WORK_ORDER_COMMAND_REQUIRES_EXECUTION', '创建演示工单指令必须由机器人命令处理器执行');
    }
    const base: RuleDiagnosisContext = { question, intent, selectedDeviceId };
    if (intent === 'unsupported_or_ambiguous') {
      return this.ai.diagnose(base);
    }
    if (intent === 'highest_risk_equipment' || intent === 'high_risk_equipment_list') {
      return this.ai.diagnose({ ...base, equipment: await this.repository.listEquipment() });
    }
    if (intent === 'pending_work_orders') {
      return this.ai.diagnose({ ...base, workOrders: await this.repository.listWorkOrders() });
    }
    if (intent === 'spare_part_availability') {
      return this.ai.diagnose({ ...base, spareParts: await this.repository.listSpareParts() });
    }
    if (intent === 'repeated_alerts') {
      return this.ai.diagnose({ ...base, alerts: await this.repository.listAlerts() });
    }
    if (intent === 'maintenance_priority') {
      const [equipment, alerts, workOrders] = await Promise.all([
        this.repository.listEquipment(),
        this.repository.listAlerts(),
        this.repository.listWorkOrders(),
      ]);
      return this.ai.diagnose({ ...base, equipment, alerts, workOrders });
    }
    const equipment = await this.repository.listEquipment();
    const device = resolveDiagnosisDevice(question, equipment, selectedDeviceId);
    if (!device) throw new AppError(404, 'DIAGNOSIS_DEVICE_NOT_FOUND', '问题中未识别到设备，请选择设备或在问题中写明设备名称');
    const [telemetry, knowledge, alerts] = await Promise.all([
      this.repository.getTelemetry(device.deviceId),
      this.repository.listKnowledge(),
      this.repository.listAlerts(),
    ]);
    return this.ai.diagnose({ ...base, equipment, device, telemetry, knowledge, alerts });
  }

  async createDemoWorkOrderFromCommand(question: string, operator: string, idempotencyKey: string) {
    const route = getDiagnosisIntentRoute(question);
    if (route.intent !== 'CREATE_DEMO_WORK_ORDER') {
      throw new AppError(400, 'NOT_WORK_ORDER_COMMAND', '当前消息不是创建演示工单指令');
    }
    const equipment = await this.repository.listEquipment();
    const device = resolveDiagnosisDevice(question, equipment);
    if (!device) throw new AppError(404, 'COMMAND_DEVICE_NOT_FOUND', '创建工单指令中未识别到有效设备');

    const [alerts, orders] = await Promise.all([
      this.repository.listAlerts(),
      this.repository.listWorkOrders(),
    ]);
    const alert = alerts
      .filter((item) => item.deviceId === device.deviceId && !['已关闭', '误报'].includes(item.alertStatus))
      .sort((left, right) => right.alertTime.localeCompare(left.alertTime))[0];
    if (!alert) throw new AppError(409, 'ACTIVE_ALERT_REQUIRED', `${device.deviceName}当前没有可用于生成演示工单的未关闭预警`);

    const activeStatuses = new Set<WorkOrderStatus>(['待接单', '已接单', '检修中', '待验证']);
    const existing = orders
      .filter((order) => order.deviceId === device.deviceId && activeStatuses.has(order.status))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .find((order) => order.sourceAlertId === alert.alertId || order.deviceId === device.deviceId);
    if (existing) return { created: false, order: existing, device, alert };

    const order = await this.createWorkOrderFromAlert(alert.alertId, {
      assignee: device.responsiblePerson || '待分配',
      assigneeUserId: device.responsibleUserId || '',
      idempotencyKey,
      suppressNotification: true,
    }, operator);
    return { created: true, order, device, alert };
  }

  async createWorkOrderFromAlert(
    alertId: string,
    input: CreateWorkOrderInput & {
      replayWorkOrderId?: string;
      suppressNotification?: boolean;
      forceNotification?: boolean;
    },
    createdBy = '黄浩',
  ) {
    const cached = this.idempotency.get(input.idempotencyKey) as WorkOrder | undefined;
    if (cached) return cached;
    const alert = await this.repository.getAlert(alertId);
    if (!alert) throw new AppError(404, 'ALERT_NOT_FOUND', '未找到预警');
    if (alert.relatedWorkOrderId) { const existing = await this.repository.getWorkOrder(alert.relatedWorkOrderId); if (existing) return existing; }
    const workOrderNo = input.replayWorkOrderId ?? (/^ALT-/.test(alert.alertId)
      ? alert.alertId.replace(/^ALT-/, 'WO-')
      : `WO-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${alert.alertId.replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'ALERT'}`);
    const persistedExisting = await this.repository.getWorkOrder(workOrderNo);
    if (persistedExisting) {
      this.idempotency.set(input.idempotencyKey, persistedExisting);
      return persistedExisting;
    }
    const twin = input.digitalTwinContext;
    if (twin && twin.equipmentId !== alert.deviceId) throw new AppError(409, 'EQUIPMENT_MISMATCH', '数字孪生场景设备与关联预警设备不一致');
    const parts = await this.repository.listSpareParts();
    const twinPartNames = twin?.faultType === '联轴器不对中' ? ['联轴器'] : twin?.faultType === '轴承温升' ? ['风机轴承', '通用润滑油'] : [];
    const required = parts.filter((part) => twin ? twinPartNames.includes(part.partName) : alert.deviceId === 'IDF-001' ? ['风机轴承', '通用润滑油'].includes(part.partName) : alert.abnormalIndicators.some((indicator) => part.partName.includes(indicator.replace('轴承', '')))).slice(0, 2);
    const riskLevel: WorkOrder['riskLevel'] = twin ? twin.riskLevel === '高' ? '高风险' : twin.riskLevel === '中高' ? '二级预警' : '关注' : alert.riskLevel;
    const faultDescription = twin
      ? `${twin.faultPart} · ${twin.faultType}；故障概率 ${twin.failureProbability}%；温度 ${twin.temperature}℃、振动 ${twin.vibration} mm/s、转速 ${twin.speed} r/min、电流 ${twin.current} A；辅助研判：${twin.diagnosis}`
      : `${alert.abnormalIndicators.join('、')}异常：${alert.suspectedCause}`;
    const createdAt = twin?.createdAt ?? new Date().toISOString();
    const faultPart = twin?.faultPart ?? (alert.abnormalIndicators.join('、') || '待现场确认');
    const faultType = twin?.faultType ?? alert.suspectedCause;
    const order: WorkOrder = {
      id: workOrderNo, workOrderNo, workOrderId: workOrderNo,
      sourceAlertId: alert.alertId,
      sourceInspectionId: alert.sourceInspectionId,
      deviceId: alert.deviceId, deviceName: alert.deviceName, riskLevel,
      faultPart, faultType, faultDescription,
      maintenanceSuggestion: twin?.advice ?? alert.maintenanceSuggestion, assignee: input.assignee, assigneeUserId: input.assigneeUserId,
      createdBy, createdAt, createdTime: createdAt, deadline: input.deadline ?? new Date(Date.now() + 24 * 3_600_000).toISOString(),
      requiredSpareParts: required.map((part) => ({ partId: part.partId, partName: part.partName, quantity: 1, unit: part.unit })),
      consumedSpareParts: [], processingRecord: [{ id: randomUUID(), time: new Date().toISOString(), operator: createdBy, action: '创建工单', detail: twin ? `由预警 ${alert.alertId} 和3D数字孪生“${twin.faultType}”场景生成` : `由预警 ${alert.alertId} 生成` }],
      healthScoreBefore: twin?.healthScore ?? alert.healthScore, status: '待接单',
      version: 1,
      source: twin ? 'digital-twin' : 'alert',
      notificationStatus: 'not_requested',
    };
    let created = await this.repository.createWorkOrder(order);
    await this.repository.updateAlert(alertId, { alertStatus: '已生成工单', relatedWorkOrderId: getWorkOrderNo(created) });
    await this.log('work-order', getWorkOrderNo(created), '创建工单', createdBy, `来源预警 ${alertId}`);
    if (
      !input.suppressNotification
      && (input.forceNotification || created.riskLevel === '高风险')
      && created.status === '待接单'
    ) {
      try {
        const notification = await this.notifications.sendWorkOrderAlert(created, {
          temperature: twin?.temperature,
          vibration: twin?.vibration,
          healthScore: twin?.healthScore ?? alert.healthScore,
          failureProbability: twin?.failureProbability,
          suggestedDeadline: twin?.advice?.[0] ?? alert.suggestedDeadline,
        });
        created = await this.persistNotificationResult(created, notification);
        await this.log(
          'work-order',
          getWorkOrderNo(created),
          notification.delivered ? '发送工单卡片' : '工单卡片发送失败',
          '系统',
          notification.delivered
            ? `消息 ${notification.messageId || 'Mock 卡片预览'} 已生成`
            : `${notification.error ?? '未知错误'}；工单已创建，可稍后重试通知`,
        );
      } catch (error) {
        created = await this.repository.updateWorkOrder(getWorkOrderTransitionIdentifier(created), {
          notificationStatus: 'failed',
          notificationMessage: error instanceof Error ? error.message : '卡片发送失败',
        });
        await this.log('work-order', getWorkOrderNo(created), '工单卡片发送失败', '系统', `${error instanceof Error ? error.message : '未知错误'}；工单已创建，可稍后重试通知`);
      }
    }
    this.idempotency.set(input.idempotencyKey, created);
    return created;
  }

  async transitionWorkOrder(id: string, input: {
    targetStatus: WorkOrderStatus; operator: string; note: string; inspectionResult?: string; repairResult?: string;
    consumedSpareParts?: Array<{ partId: string; quantity: number }>; healthScoreAfter?: number; verificationResult?: string; idempotencyKey: string;
  }, options: { refreshCard?: boolean } = {}) {
    const cached = this.idempotency.get(input.idempotencyKey) as WorkOrder | undefined;
    if (cached) return cached;
    const order = await this.repository.getWorkOrder(id);
    if (!order) throw new AppError(404, 'WORK_ORDER_NOT_FOUND', '未找到维修工单');
    if (order.status === input.targetStatus || ['已关闭', '已取消'].includes(order.status)) return order;
    try { assertWorkOrderTransition(order.status, input.targetStatus); } catch (error) { throw new AppError(409, 'INVALID_TRANSITION', (error as Error).message); }
    if (input.targetStatus === '待验证' && (!input.inspectionResult || !input.repairResult)) throw new AppError(400, 'REQUIRED_FIELDS', '进入待验证前必须填写检查结果和维修结果');
    if (input.targetStatus === '已完成' && (!input.verificationResult || input.healthScoreAfter === undefined)) throw new AppError(400, 'REQUIRED_FIELDS', '完成工单前必须填写验证结果和维修后健康度');
    const consumed = input.consumedSpareParts ? await this.resolveUsage(input.consumedSpareParts) : order.consumedSpareParts;
    if (input.targetStatus === '已完成') await this.ensureStock(consumed);
    const record = { id: randomUUID(), time: new Date().toISOString(), operator: input.operator, action: `状态推进：${order.status} → ${input.targetStatus}`, detail: input.note || '按标准流程推进' };
    const updateIdentifier = getWorkOrderTransitionIdentifier(order);
    if (!updateIdentifier) throw new AppError(404, 'WORK_ORDER_IDENTIFIER_MISSING', '维修工单缺少可用标识');
    let updated = await this.repository.updateWorkOrder(updateIdentifier, {
      status: input.targetStatus, inspectionResult: input.inspectionResult ?? order.inspectionResult,
      repairResult: input.repairResult ?? order.repairResult, consumedSpareParts: consumed,
      healthScoreAfter: input.healthScoreAfter ?? order.healthScoreAfter, verificationResult: input.verificationResult ?? order.verificationResult,
      processingRecord: [...order.processingRecord, record],
      version: (order.version ?? 1) + 1,
      ...(input.targetStatus === '已完成' ? { completedAt: new Date().toISOString(), completionIdempotencyKey: input.idempotencyKey } : {}),
    });
    if (input.targetStatus === '已完成') await this.completeWorkOrder(updated, input.operator, input.idempotencyKey);
    else if (order.sourceAlertId) await this.repository.updateAlert(order.sourceAlertId, { alertStatus: input.targetStatus === '待接单' ? '已生成工单' : '处理中' });
    await this.log('work-order', getWorkOrderNo(updated), '推进工单状态', input.operator, `${order.status} → ${input.targetStatus}；${input.note}`);
    if (options.refreshCard !== false) updated = await this.refreshWorkOrderCard(updated);
    this.idempotency.set(input.idempotencyKey, updated);
    return updated;
  }

  async resendWorkOrderNotification(id: string, operator: string) {
    const order = await this.repository.getWorkOrder(id);
    if (!order) throw new AppError(404, 'WORK_ORDER_NOT_FOUND', '未找到维修工单');
    const notification = await this.notifications.sendWorkOrderAlert(order);
    const updated = await this.persistNotificationResult(order, notification);
    await this.log(
      'work-order',
      getWorkOrderNo(updated),
      notification.delivered ? '重新发送工单卡片' : '重新发送工单卡片失败',
      operator,
      notification.delivered
        ? `消息 ${notification.messageId} 已发送`
        : `${notification.error ?? '未知错误'}；本地工单未回滚`,
    );
    return updated;
  }

  async createKnowledgeCandidateFromWorkOrder(id: string, operator: string, idempotencyKey: string) {
    const cached = this.idempotency.get(idempotencyKey) as WorkOrder | undefined;
    if (cached) return cached;
    const order = await this.repository.getWorkOrder(id);
    if (!order) throw new AppError(404, 'WORK_ORDER_NOT_FOUND', '未找到维修工单');
    if (!['已完成', '已关闭'].includes(order.status)) throw new AppError(409, 'WORK_ORDER_NOT_COMPLETED', '工单完成后才能生成知识候选');
    if (order.knowledgeCandidateCreatedAt) return order;
    if (!this.repository.addKnowledge) throw new AppError(503, 'KNOWLEDGE_WRITE_UNAVAILABLE', '当前知识库不支持写入');
    const knowledgeId = `KB-CANDIDATE-${order.workOrderNo}`;
    const existing = (await this.repository.listKnowledge()).find((entry) => entry.knowledgeId === knowledgeId);
    if (!existing) {
      const device = await this.mustDevice(order.deviceId);
      const alert = order.sourceAlertId ? await this.repository.getAlert(order.sourceAlertId) : undefined;
      await this.repository.addKnowledge({
        knowledgeId,
        title: `${device.deviceName}维修闭环候选案例`,
        deviceType: device.deviceType,
        faultPhenomenon: order.faultDescription,
        abnormalIndicators: alert?.abnormalIndicators ?? [],
        possibleCauses: [alert?.suspectedCause ?? order.faultDescription],
        inspectionSteps: order.maintenanceSuggestion,
        handlingMethod: [order.repairResult ?? '按维修工单记录处理'],
        applicableCondition: device.operatingCondition,
        safetyReminder: '本条目来自模拟维修闭环，正式采用前需由专业人员复核并结合安全规程。',
        relatedSpareParts: order.consumedSpareParts.map((item) => item.partName),
        source: '维修工单闭环候选（模拟数据）',
        updatedAt: new Date().toISOString(),
      });
    }
    const updated = await this.repository.updateWorkOrder(getWorkOrderTransitionIdentifier(order), {
      knowledgeCandidateCreatedAt: new Date().toISOString(),
      version: (order.version ?? 1) + 1,
    });
    await this.log('work-order', order.workOrderNo, '生成知识库候选', operator, '由飞书协同动作生成，已执行幂等检查');
    this.idempotency.set(idempotencyKey, updated);
    return updated;
  }

  async resyncWorkOrder(id: string) {
    const order = await this.repository.getWorkOrder(id);
    if (!order) throw new AppError(404, 'WORK_ORDER_NOT_FOUND', '未找到维修工单');
    if (this.repository.resyncWorkOrder) return this.repository.resyncWorkOrder(getWorkOrderTransitionIdentifier(order));
    return this.repository.updateWorkOrder(getWorkOrderTransitionIdentifier(order), {
      syncStatus: 'pending', syncMessage: '正在重新同步', syncErrorCode: undefined,
    });
  }

  async addWorkOrderRecord(id: string, input: { operator: string; detail: string }) {
    const order = await this.repository.getWorkOrder(id); if (!order) throw new AppError(404, 'WORK_ORDER_NOT_FOUND', '未找到维修工单');
    const record = { id: randomUUID(), time: new Date().toISOString(), operator: input.operator, action: '补充处理记录', detail: input.detail };
    return this.repository.updateWorkOrder(id, { processingRecord: [...order.processingRecord, record] });
  }

  async stockChange(type: '入库' | '出库', input: { partId: string; quantity: number; operator: string; remark: string; idempotencyKey: string }) {
    const cached = this.idempotency.get(input.idempotencyKey); if (cached) return cached;
    const part = await this.repository.getSparePart(input.partId); if (!part) throw new AppError(404, 'PART_NOT_FOUND', '未找到备件');
    if (type === '出库' && part.currentStock < input.quantity) throw new AppError(409, 'INSUFFICIENT_STOCK', `${part.partName}库存不足：现有 ${part.currentStock}${part.unit}`);
    const stock = part.currentStock + (type === '入库' ? input.quantity : -input.quantity);
    const updated = await this.repository.updateSparePart(part.partId, { currentStock: stock, stockStatus: getStockStatus(stock, part.safeStock), ...(type === '出库' ? { lastOutboundDate: new Date().toISOString().slice(0, 10) } : { lastInboundDate: new Date().toISOString().slice(0, 10) }) });
    await this.repository.addSpareTransaction({ transactionId: `TX-${randomUUID()}`, partId: part.partId, type, quantity: input.quantity, time: new Date().toISOString(), operator: input.operator, remark: input.remark, idempotencyKey: input.idempotencyKey });
    await this.log('spare-part', part.partId, `${type}登记`, input.operator, `${input.quantity}${part.unit}；${input.remark}`);
    this.idempotency.set(input.idempotencyKey, updated); return updated;
  }

  async createEquipment(input: Omit<Equipment, 'deviceId' | 'healthScore' | 'riskLevel' | 'vibration' | 'temperature' | 'current' | 'pressure' | 'speed' | 'runningHours' | 'lastMaintenanceDate' | 'nextMaintenanceDate' | 'dataSource' | 'updatedAt'>) {
    const count = (await this.repository.listEquipment()).length + 1;
    return this.repository.createEquipment({ ...input, deviceId: `DEV-${String(count).padStart(3, '0')}`, healthScore: 100, riskLevel: '健康', vibration: 0, temperature: 25, current: 0, pressure: 0, speed: 0, runningHours: 0, lastMaintenanceDate: new Date().toISOString().slice(0, 10), nextMaintenanceDate: new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10), dataSource: '模拟数据', updatedAt: new Date().toISOString() });
  }

  async history(deviceId: string) {
    const alerts = (await this.repository.listAlerts()).filter((item) => item.deviceId === deviceId);
    const workOrders = (await this.repository.listWorkOrders()).filter((item) => item.deviceId === deviceId);
    const entityIds = new Set([deviceId, ...alerts.map((item) => item.alertId), ...workOrders.map((item) => item.workOrderId)]);
    return { alerts, workOrders, logs: (await this.repository.listOperationLogs()).filter((log) => entityIds.has(log.entityId)), spareTransactions: (await this.repository.listSpareTransactions()).filter((tx) => workOrders.some((order) => order.workOrderId === tx.relatedWorkOrderId)) };
  }

  private async completeWorkOrder(order: WorkOrder, operator: string, key: string) {
    for (const usage of order.consumedSpareParts) {
      const part = await this.repository.getSparePart(usage.partId); if (!part) continue;
      const stock = part.currentStock - usage.quantity;
      await this.repository.updateSparePart(part.partId, { currentStock: stock, stockStatus: getStockStatus(stock, part.safeStock), lastOutboundDate: new Date().toISOString().slice(0, 10) });
      await this.repository.addSpareTransaction({ transactionId: `TX-${randomUUID()}`, partId: part.partId, type: '出库', quantity: usage.quantity, time: new Date().toISOString(), operator, relatedWorkOrderId: order.workOrderId, remark: '工单完工自动扣减', idempotencyKey: `${key}-${part.partId}` });
    }
    const score = order.healthScoreAfter ?? 92;
    await this.repository.updateEquipment(order.deviceId, { healthScore: score, riskLevel: score >= 90 ? '健康' : score >= 75 ? '关注' : score >= 60 ? '二级预警' : '高风险', runningStatus: '运行', ...(order.deviceId === 'IDF-001' ? { vibration: 3.1, temperature: 68 } : {}), updatedAt: new Date().toISOString(), lastMaintenanceDate: new Date().toISOString().slice(0, 10) });
    const device = await this.mustDevice(order.deviceId);
    const telemetry = await this.repository.getTelemetry(order.deviceId);
    const point: TelemetryPoint = { timestamp: new Date().toISOString(), deviceId: device.deviceId, operatingCondition: device.operatingCondition, vibration: device.vibration, temperature: device.temperature, current: device.current, pressure: device.pressure, speed: device.speed, healthScore: score, riskLevel: device.riskLevel };
    await this.repository.setTelemetry(order.deviceId, [...telemetry, point]);
    const alert = order.sourceAlertId ? await this.repository.getAlert(order.sourceAlertId) : undefined;
    if (order.sourceAlertId) await this.repository.updateAlert(order.sourceAlertId, { alertStatus: '已关闭', closedAt: new Date().toISOString() });
    if (order.sourceInspectionId) {
      await this.repository.updateInspection(order.sourceInspectionId, {
        status: '已关闭',
        updatedAt: new Date().toISOString(),
      });
    }
    if (this.options.createKnowledgeCandidates && this.repository.addKnowledge) {
      const candidate: KnowledgeEntry = {
        knowledgeId: `KB-CANDIDATE-${order.workOrderId}`,
        title: `${device.deviceName}维修闭环候选案例`,
        deviceType: device.deviceType,
        faultPhenomenon: order.faultDescription,
        abnormalIndicators: alert?.abnormalIndicators ?? [],
        possibleCauses: [alert?.suspectedCause ?? order.faultDescription],
        inspectionSteps: order.maintenanceSuggestion,
        handlingMethod: [order.repairResult ?? '按维修工单记录处理'],
        applicableCondition: device.operatingCondition,
        safetyReminder: '本条目来自模拟维修闭环，正式采用前需由专业人员复核并结合安全规程。',
        relatedSpareParts: order.consumedSpareParts.map((item) => item.partName),
        source: '维修工单闭环候选（模拟数据）',
        updatedAt: new Date().toISOString(),
      };
      await this.repository.addKnowledge(candidate);
    }
    await this.log('device', order.deviceId, '维修闭环完成', operator, `健康度由 ${order.healthScoreBefore} 恢复至 ${score}；形成知识库候选案例`);
  }

  private async resolveUsage(items: Array<{ partId: string; quantity: number }>): Promise<SparePartUsage[]> {
    return Promise.all(items.map(async (item) => { const part = await this.repository.getSparePart(item.partId); if (!part) throw new AppError(404, 'PART_NOT_FOUND', `未找到备件 ${item.partId}`); return { ...item, partName: part.partName, unit: part.unit }; }));
  }
  private async ensureStock(items: SparePartUsage[]) { for (const usage of items) { const part = await this.repository.getSparePart(usage.partId); if (!part || part.currentStock < usage.quantity) throw new AppError(409, 'INSUFFICIENT_STOCK', `${part?.partName ?? usage.partId}库存不足，无法完成工单`); } }
  private async mustDevice(id: string) { const item = await this.repository.getEquipment(id); if (!item) throw new AppError(404, 'DEVICE_NOT_FOUND', '未找到设备'); return item; }
  private async persistNotificationResult(order: WorkOrder, result: NotificationResult) {
    const notConfigured = !result.delivered && /未配置/u.test(result.error ?? '');
    return this.repository.updateWorkOrder(getWorkOrderTransitionIdentifier(order), {
      notificationStatus: result.delivered ? 'sent' : notConfigured ? 'not_requested' : 'failed',
      notificationMessage: result.delivered
        ? '飞书工单卡片已发送'
        : notConfigured
          ? '工单已创建，通知群未配置'
          : (result.error ?? '卡片发送失败'),
      ...(result.messageId ? { feishuMessageId: result.messageId } : {}),
    });
  }
  private async refreshWorkOrderCard(order: WorkOrder) {
    if (!order.feishuMessageId) return order;
    const result = await this.notifications.updateCard(
      order.feishuMessageId,
      buildHighRiskWorkOrderCard(order),
    );
    const updated = await this.persistNotificationResult(order, result);
    await this.log(
      'work-order',
      getWorkOrderNo(updated),
      result.delivered ? '更新飞书工单卡片' : '更新飞书工单卡片失败',
      '系统',
      result.delivered ? `消息 ${order.feishuMessageId} 已更新` : (result.error ?? '更新失败'),
    );
    return updated;
  }
  private async log(entityType: string, entityId: string, action: string, operator: string, detail: string) { await this.repository.addOperationLog({ logId: `LOG-${randomUUID()}`, entityType, entityId, action, operator, detail, timestamp: new Date().toISOString() }); }
}
