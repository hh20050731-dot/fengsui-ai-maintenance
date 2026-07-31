import { createHash } from 'node:crypto';
import { getDiagnosisIntentRoute, type AiDiagnosis, type OperationLog, type WorkOrder } from '@fengsui/shared';
import { AppError } from '../middleware/errors.js';
import {
  buildDiagnosisWorkOrderCard,
  buildHighRiskWorkOrderCard,
  type NotificationProvider,
  type WorkOrderAlertContext,
} from '../providers/notification-provider.js';
import type { DataRepository } from '../repositories/data-repository.js';
import {
  asFeishuCallbackObject,
  decryptFeishuEnvelope,
  safeSecretEqual,
} from './feishu-callback-envelope.js';
import { normalizeFeishuMessageText } from './feishu-message-text.js';
import type { OperationsService } from './operations-service.js';

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return asFeishuCallbackObject(value);
}

export function decryptFeishuPayload(encrypted: string, encryptKey: string): JsonObject {
  try {
    return decryptFeishuEnvelope(encrypted, encryptKey);
  } catch {
    throw new AppError(401, 'INVALID_ENCRYPTED_EVENT', '飞书加密回调解密失败');
  }
}

export function redactSensitiveText(value: string) {
  return value
    .replace(/(app[_-]?secret|verification[_-]?token|encrypt[_-]?key|access[_-]?token)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, 'Bearer [REDACTED]');
}

export { safeSecretEqual };

function parseTextMessage(payload: JsonObject) {
  const event = asObject(payload.event);
  const message = asObject(event.message);
  if (message.message_type !== 'text') return undefined;
  return normalizeFeishuMessageText(message.content, message.mentions);
}

function trustedOperatorLabel(payload: JsonObject) {
  const operator = asObject(asObject(payload.event).operator);
  const identifier = [operator.user_id, operator.open_id, operator.union_id]
    .find((value): value is string => typeof value === 'string' && value.length > 0);
  if (!identifier) return '飞书用户';
  return `飞书用户#${createHash('sha256').update(identifier).digest('hex').slice(0, 8)}`;
}

function workOrderIdentifierFromCard(value: JsonObject) {
  return String(value.recordId ?? value.id ?? value.workOrderId ?? value.workOrderNo ?? '');
}

const workOrderActions = new Set([
  'accept_order', 'start_process', 'submit_acceptance', 'approve_completion',
  'return_processing', 'close_order', 'create_knowledge_candidate',
]);
const allowedWorkOrderCardKeys = new Set(['action', 'workOrderId', 'recordId', 'expectedStatus', 'version']);

function parseWorkOrderCardAction(value: JsonObject) {
  const action = typeof value.action === 'string' ? value.action : '';
  if (!workOrderActions.has(action)) return undefined;
  const unexpected = Object.keys(value).find((key) => !allowedWorkOrderCardKeys.has(key));
  if (unexpected) throw new AppError(400, 'INVALID_CARD_VALUE', '卡片参数不符合当前版本，请刷新后重试');
  if (typeof value.workOrderId !== 'string' || !value.workOrderId) throw new AppError(400, 'WORK_ORDER_IDENTIFIER_MISSING', '卡片回调缺少工单标识');
  if (value.recordId !== undefined && typeof value.recordId !== 'string') throw new AppError(400, 'INVALID_CARD_VALUE', '卡片记录标识格式错误');
  if (typeof value.expectedStatus !== 'string' || !value.expectedStatus) throw new AppError(400, 'INVALID_CARD_VALUE', '卡片状态版本信息缺失');
  if (!Number.isInteger(value.version) || Number(value.version) < 1) throw new AppError(400, 'INVALID_CARD_VALUE', '卡片版本信息无效');
  return { action, identifier: workOrderIdentifierFromCard(value), expectedStatus: value.expectedStatus, version: Number(value.version) };
}

export function formatDiagnosisForFeishu(result: AiDiagnosis) {
  return [
    `风险判断：${result.riskJudgment}`,
    `当前工况：${result.operatingCondition}`,
    `异常指标：${result.abnormalIndicators.join('、') || '无'}`,
    `趋势证据：${result.trendEvidence.join('；') || '无'}`,
    `疑似原因：${result.suspectedCauses.join('；') || '无'}`,
    `推荐检查：${result.inspectionItems.join('；') || '无'}`,
    `建议时限：${result.suggestedDeadline}`,
    `关联备件：${result.relatedSpareParts.join('、') || '无'}`,
    `规则匹配度：${Math.round(result.confidence * 100)}%`,
    `风险提示：${result.riskNotice}`,
  ].join('\n');
}

function workOrderCardResponse(order: WorkOrder, content: string) {
  return {
    toast: { type: 'success', content },
    card: { type: 'raw', data: buildHighRiskWorkOrderCard(order) },
  };
}

function rawCardFromResult(result: unknown) {
  const resultObject = asObject(result);
  const card = asObject(resultObject.card);
  const data = asObject(card.data);
  return card.type === 'raw' && data.schema === '2.0' ? data : undefined;
}

class EventIdempotencyStore {
  private readonly memory = new Map<string, number>();
  private readonly inFlight = new Set<string>();
  constructor(private readonly repository: DataRepository, private readonly ttlMs = 24 * 60 * 60 * 1000, private readonly maxEntries = 5_000) {}

  private prune() {
    const now = Date.now();
    for (const [key, expiresAt] of this.memory) if (expiresAt <= now) this.memory.delete(key);
    while (this.memory.size > this.maxEntries) this.memory.delete(this.memory.keys().next().value as string);
  }

  async begin(eventId: string) {
    this.prune();
    if ((this.memory.get(eventId) ?? 0) > Date.now() || this.inFlight.has(eventId)) return false;
    try {
      const logs = await this.repository.listOperationLogs(eventId);
      if (logs.some((log) => log.entityType === 'feishu-event' && log.action === '处理飞书回调')) {
        this.memory.set(eventId, Date.now() + this.ttlMs);
        return false;
      }
    } catch {
      console.warn('[feishu-callback] 持久幂等记录读取失败，本次仅使用进程内防重');
    }
    this.inFlight.add(eventId);
    return true;
  }

  async mark(eventId: string, eventType: string) {
    this.inFlight.delete(eventId);
    this.memory.set(eventId, Date.now() + this.ttlMs);
    this.prune();
    const log: OperationLog = {
      logId: `LOG-FEISHU-${createHash('sha256').update(eventId).digest('hex').slice(0, 16)}`,
      entityType: 'feishu-event',
      entityId: eventId,
      action: '处理飞书回调',
      operator: '系统',
      detail: `事件类型：${redactSensitiveText(eventType)}`,
      timestamp: new Date().toISOString(),
    };
    try {
      await this.repository.addOperationLog(log);
    } catch {
      console.warn('[feishu-callback] 持久幂等记录写入失败，本实例仍会阻止重复事件');
    }
  }

  abort(eventId: string) { this.inFlight.delete(eventId); }
}

export interface FeishuCallbackConfig {
  verificationToken?: string;
  encryptKey?: string;
}

export class FeishuCallbackService {
  private readonly events: EventIdempotencyStore;
  private readonly workOrderLocks = new Map<string, Promise<void>>();
  constructor(
    private readonly repository: DataRepository,
    private readonly operations: OperationsService,
    private readonly notifications: NotificationProvider,
    private readonly config: FeishuCallbackConfig,
  ) {
    this.events = new EventIdempotencyStore(repository);
  }

  async handle(rawBody: unknown) {
    if (!this.config.verificationToken) {
      throw new AppError(503, 'EVENT_VERIFICATION_NOT_CONFIGURED', '飞书回调校验尚未配置');
    }
    const envelope = asObject(rawBody);
    const payload = typeof envelope.encrypt === 'string'
      ? this.decryptEnvelope(envelope.encrypt)
      : envelope;
    const header = asObject(payload.header);
    const token = header.token ?? payload.token;
    if (!safeSecretEqual(token, this.config.verificationToken)) {
      throw new AppError(401, 'INVALID_EVENT_SOURCE', '事件来源校验失败');
    }
    if (typeof payload.challenge === 'string') return { challenge: payload.challenge };

    return this.handleTrustedEvent(payload);
  }

  /** 仅供飞书官方 SDK 已完成连接鉴权的 WebSocket 事件使用。 */
  async handleTrustedEvent(rawPayload: unknown) {
    const payload = asObject(rawPayload);
    const header = asObject(payload.header);

    const event = asObject(payload.event);
    const action = asObject(event.action);
    const actionValue = asObject(action.value ?? asObject(payload.action).value);
    const eventType = String(header.event_type ?? payload.type ?? 'unknown');
    const messageId = asObject(event.message).message_id;
    const eventId = eventType === 'im.message.receive_v1' && typeof messageId === 'string' && messageId
      ? `message:${messageId}`
      : String(header.event_id ?? payload.event_id ?? createHash('sha256').update(JSON.stringify({ eventType, actionValue, messageId })).digest('hex'));
    if (!await this.events.begin(eventId)) return { success: true, data: { duplicate: true, eventId } };

    try {
      const operator = trustedOperatorLabel(payload);
      let result: unknown;
      const cardAction = parseWorkOrderCardAction(actionValue);
      if (cardAction) result = await this.withWorkOrderLock(cardAction.identifier, () => this.handleWorkOrderAction(cardAction, eventId, operator));
      else if (actionValue.action === 'accept_work_order') result = await this.withWorkOrderLock(workOrderIdentifierFromCard(actionValue), () => this.acceptWorkOrder(actionValue, eventId, operator));
      else if (actionValue.action === 'defer_work_order') result = await this.deferWorkOrder(actionValue, operator);
      else if (actionValue.action === 'acknowledge' && actionValue.alertId) result = await this.acknowledgeAlert(String(actionValue.alertId), operator);
      else if (actionValue.action === 'create_work_order' && actionValue.alertId) result = await this.createWorkOrder(String(actionValue.alertId), eventId, operator);
      else if (eventType === 'im.message.receive_v1') result = await this.replyToMessage(payload, eventId, operator);
      else result = { success: true, data: { received: true, eventId } };

      if (eventType === 'card.action.trigger') await this.refreshSourceCard(payload, result, eventId);
      await this.events.mark(eventId, eventType);
      return result;
    } catch (error) {
      this.events.abort(eventId);
      throw error;
    }
  }

  private decryptEnvelope(encrypted: string) {
    if (!this.config.encryptKey) throw new AppError(401, 'ENCRYPT_KEY_REQUIRED', '收到加密回调，但服务端未配置 Encrypt Key');
    return decryptFeishuPayload(encrypted, this.config.encryptKey);
  }

  private async withWorkOrderLock<T>(identifier: string, task: () => Promise<T>) {
    const previous = this.workOrderLocks.get(identifier) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.catch(() => undefined).then(() => current);
    this.workOrderLocks.set(identifier, queued);
    await previous.catch(() => undefined);
    try {
      return await task();
    } finally {
      release();
      if (this.workOrderLocks.get(identifier) === queued) this.workOrderLocks.delete(identifier);
    }
  }

  private async acceptWorkOrder(value: JsonObject, eventId: string, operator: string) {
    const identifier = workOrderIdentifierFromCard(value);
    if (!identifier) throw new AppError(400, 'WORK_ORDER_IDENTIFIER_MISSING', '卡片回调缺少工单标识');
    const current = await this.repository.getWorkOrder(identifier);
    if (!current) throw new AppError(404, 'WORK_ORDER_NOT_FOUND', `未找到维修工单：${String(value.workOrderNo ?? identifier)}`);
    if (current.status !== '待接单') return workOrderCardResponse(current, `工单当前状态已是${current.status}，未重复推进`);
    const updated = await this.operations.transitionWorkOrder(current.recordId || current.id || current.workOrderNo, {
      targetStatus: '已接单',
      operator,
      note: '通过飞书高风险工单卡片确认接单',
      idempotencyKey: `feishu-event-${eventId}-accept`,
    }, { refreshCard: false });
    return workOrderCardResponse(updated, `接单成功：${updated.workOrderNo}`);
  }

  private async handleWorkOrderAction(
    action: { action: string; identifier: string; expectedStatus: unknown; version: number },
    eventId: string,
    operator: string,
  ) {
    const current = await this.repository.getWorkOrder(action.identifier);
    if (!current) throw new AppError(404, 'WORK_ORDER_NOT_FOUND', '未找到维修工单，请刷新卡片后重试');
    const currentVersion = current.version ?? 1;
    if (current.status !== action.expectedStatus || currentVersion !== action.version) {
      return workOrderCardResponse(current, `工单状态已更新为${current.status}，当前卡片未重复执行`);
    }
    const allowedByStatus: Record<string, string[]> = {
      待接单: ['accept_order'], 已接单: ['start_process'], 检修中: ['submit_acceptance'],
      待验证: ['approve_completion', 'return_processing'], 已完成: ['close_order', 'create_knowledge_candidate'],
      已关闭: [], 已取消: [],
    };
    if (!(allowedByStatus[current.status] ?? []).includes(action.action)) {
      return workOrderCardResponse(current, `当前状态“${current.status}”不允许执行此操作`);
    }
    const key = `feishu-work-order-${current.workOrderNo}-v${currentVersion}-${action.action}`;
    if (action.action === 'create_knowledge_candidate') {
      const updated = await this.operations.createKnowledgeCandidateFromWorkOrder(current.recordId || current.id, operator, key);
      return workOrderCardResponse(updated, '知识库候选已生成');
    }
    const targetByAction = {
      accept_order: '已接单', start_process: '检修中', submit_acceptance: '待验证',
      approve_completion: '已完成', return_processing: '检修中', close_order: '已关闭',
    } as const;
    const targetStatus = targetByAction[action.action as keyof typeof targetByAction];
    if (!targetStatus) throw new AppError(400, 'UNSUPPORTED_CARD_ACTION', '不支持的工单操作');
    const updated = await this.operations.transitionWorkOrder(current.recordId || current.id || current.workOrderNo, {
      targetStatus,
      operator,
      note: `通过飞书工单卡片执行：${action.action}`,
      ...(targetStatus === '待验证' ? {
        inspectionResult: current.inspectionResult ?? '通过飞书卡片提交验收，现场检查明细待补充',
        repairResult: current.repairResult ?? '处理记录已提交，具体维修结果以现场记录为准',
      } : {}),
      ...(targetStatus === '已完成' ? {
        healthScoreAfter: current.healthScoreAfter ?? current.healthScoreBefore,
        verificationResult: current.verificationResult ?? '通过飞书卡片确认验收，需结合现场记录复核',
      } : {}),
      idempotencyKey: key,
    }, { refreshCard: false });
    const labels: Record<string, string> = {
      accept_order: '接单成功', start_process: '已开始处理', submit_acceptance: '已提交验收',
      approve_completion: '验收完成', return_processing: '已退回处理', close_order: '工单已关闭',
    };
    return workOrderCardResponse(updated, labels[action.action] ?? '操作成功');
  }

  private async deferWorkOrder(value: JsonObject, operator: string) {
    const identifier = workOrderIdentifierFromCard(value);
    if (!identifier) throw new AppError(400, 'WORK_ORDER_IDENTIFIER_MISSING', '卡片回调缺少工单标识');
    const order = await this.repository.getWorkOrder(identifier);
    if (!order) throw new AppError(404, 'WORK_ORDER_NOT_FOUND', `未找到维修工单：${String(value.workOrderNo ?? identifier)}`);
    await this.repository.addOperationLog({
      logId: `LOG-DEFER-${Date.now()}`,
      entityType: 'work-order',
      entityId: order.workOrderNo,
      action: '卡片暂缓处理',
      operator,
      detail: '仅登记暂缓，不绕过工单状态机',
      timestamp: new Date().toISOString(),
    });
    return workOrderCardResponse(order, `已登记暂缓：${order.workOrderNo}`);
  }

  private async acknowledgeAlert(alertId: string, operator: string) {
    await this.repository.updateAlert(alertId, { alertStatus: '已确认', acknowledgedBy: operator, acknowledgedAt: new Date().toISOString() });
    return { toast: { type: 'success', content: '预警已确认' } };
  }

  private async createWorkOrder(alertId: string, eventId: string, operator: string) {
    const order = await this.operations.createWorkOrderFromAlert(alertId, {
      assignee: '张工',
      assigneeUserId: 'zhang-gong',
      idempotencyKey: `feishu-event-${eventId}-create`,
    }, operator);
    return workOrderCardResponse(order, `已创建工单 ${order.workOrderNo}`);
  }

  private async refreshSourceCard(payload: JsonObject, result: unknown, eventId: string) {
    const event = asObject(payload.event);
    const context = asObject(event.context);
    const messageId = context.open_message_id;
    const card = rawCardFromResult(result);
    if (typeof messageId !== 'string' || !messageId || !card) return;

    const delivery = await this.notifications.updateCard(messageId, card);
    if (delivery.delivered) return;
    try {
      await this.repository.addOperationLog({
        logId: `LOG-CARD-REFRESH-${createHash('sha256').update(eventId).digest('hex').slice(0, 16)}`,
        entityType: 'feishu-event',
        entityId: eventId,
        action: '更新飞书工单卡片失败',
        operator: '系统',
        detail: '工单状态已更新，卡片刷新失败，可重新查询工单获取最新状态',
        timestamp: new Date().toISOString(),
      });
    } catch {
      console.warn('[feishu-callback] 卡片刷新失败且操作日志暂不可用');
    }
  }

  private async buildInteractiveDiagnosisReply(diagnosis: AiDiagnosis) {
    if (!['equipment_status', 'abnormal_metrics', 'diagnosis_reason'].includes(diagnosis.intent)) return undefined;
    const device = await this.repository.getEquipment(diagnosis.deviceId);
    if (!device) return undefined;
    const [alerts, orders] = await Promise.all([
      this.repository.listAlerts(),
      this.repository.listWorkOrders(),
    ]);
    const deviceAlerts = alerts
      .filter((alert) => alert.deviceId === device.deviceId && alert.alertStatus !== '误报')
      .sort((left, right) => right.alertTime.localeCompare(left.alertTime));
    const currentAlert = deviceAlerts.find((alert) => !['已关闭', '误报'].includes(alert.alertStatus)) ?? deviceAlerts[0];
    const relatedOrder = currentAlert?.relatedWorkOrderId
      ? orders.find((order) => [order.id, order.workOrderNo, order.workOrderId, order.recordId].includes(currentAlert.relatedWorkOrderId))
      : undefined;
    const activeStatuses = new Set(['待接单', '已接单', '检修中', '待验证']);
    const activeOrder = relatedOrder ?? orders
      .filter((order) => order.deviceId === device.deviceId && activeStatuses.has(order.status))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

    if (activeOrder) {
      const context: WorkOrderAlertContext = {
        temperature: device.temperature,
        vibration: device.vibration,
        healthScore: device.healthScore,
        failureProbability: currentAlert ? Math.round(currentAlert.confidence * 100) : undefined,
        suggestedDeadline: currentAlert?.suggestedDeadline,
      };
      return buildHighRiskWorkOrderCard(activeOrder, context);
    }
    return buildDiagnosisWorkOrderCard({ diagnosis, device, alert: currentAlert });
  }

  private async handleCreateDemoWorkOrderCommand(
    question: string,
    chatId: string,
    eventId: string,
    operator: string,
  ) {
    const command = await this.operations.createDemoWorkOrderFromCommand(
      question,
      operator,
      `feishu-demo-command-${eventId}`,
    );
    const delivery = await this.notifications.sendWorkOrderAlert(command.order, {
      temperature: command.device.temperature,
      vibration: command.device.vibration,
      healthScore: command.device.healthScore,
      failureProbability: Math.round(command.alert.confidence * 100),
      suggestedDeadline: command.alert.suggestedDeadline,
      notice: command.created ? '演示工单已创建' : '已存在进行中的演示工单',
    }, chatId);
    if (!delivery.delivered) {
      throw new AppError(502, 'BOT_CARD_REPLY_FAILED', delivery.error ?? '交互式工单卡片发送失败');
    }

    const identifier = command.order.recordId || command.order.id || command.order.workOrderNo;
    const saved = await this.repository.updateWorkOrder(identifier, {
      feishuMessageId: delivery.messageId,
      notificationStatus: 'sent',
      notificationMessage: command.created ? '演示工单交互卡片已发送' : '进行中工单交互卡片已重新发送',
    });
    try {
      await this.repository.addOperationLog({
        logId: `LOG-DEMO-CARD-${createHash('sha256').update(`${eventId}:${saved.workOrderNo}`).digest('hex').slice(0, 16)}`,
        entityType: 'work-order',
        entityId: saved.workOrderNo,
        action: command.created ? '机器人创建演示工单并发送卡片' : '机器人返回进行中演示工单卡片',
        operator,
        detail: '已使用当前消息会话发送交互式卡片，消息映射已保存',
        timestamp: new Date().toISOString(),
      });
    } catch {
      console.warn('[feishu-callback] 演示工单卡片日志暂不可用');
    }
    return {
      success: true,
      data: {
        intent: 'CREATE_DEMO_WORK_ORDER',
        created: command.created,
        duplicate: !command.created,
        msgType: 'interactive',
        messageId: delivery.messageId,
        workOrderId: saved.id,
        workOrderNo: saved.workOrderNo,
        recordId: saved.recordId,
        status: saved.status,
      },
    };
  }

  private async replyToMessage(payload: JsonObject, eventId: string, operator: string) {
    const event = asObject(payload.event);
    const sender = asObject(event.sender);
    if (sender.sender_type === 'app' || sender.sender_type === 'bot') {
      return { success: true, data: { ignored: true, reason: 'bot-message' } };
    }
    const question = parseTextMessage(payload);
    if (!question) return { success: true, data: { ignored: true, reason: 'not-text-message' } };
    const message = asObject(event.message);
    const chatId = typeof message.chat_id === 'string' ? message.chat_id : undefined;
    if (!chatId) throw new AppError(400, 'CHAT_ID_MISSING', '消息事件缺少会话 ID');
    const route = getDiagnosisIntentRoute(question);
    if (route.intent === 'CREATE_DEMO_WORK_ORDER') {
      return this.handleCreateDemoWorkOrderCommand(question, chatId, eventId, operator);
    }
    const diagnosis = await this.operations.diagnose(undefined, question);
    const interactiveCard = await this.buildInteractiveDiagnosisReply(diagnosis);
    const delivery = interactiveCard
      ? await this.notifications.sendCard(interactiveCard, chatId)
      : await this.notifications.sendText(formatDiagnosisForFeishu(diagnosis), chatId, 'chat_id');
    if (!delivery.delivered) throw new AppError(502, 'BOT_REPLY_FAILED', delivery.error ?? '机器人回复发送失败');
    return {
      success: true,
      data: {
        replied: true,
        replyType: interactiveCard ? 'interactive' : 'text',
        messageId: delivery.messageId,
        intent: diagnosis.intent,
      },
    };
  }
}
