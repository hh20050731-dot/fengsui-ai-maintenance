import { createDecipheriv, createHash, timingSafeEqual } from 'node:crypto';
import type { AiDiagnosis, OperationLog, WorkOrder } from '@fengsui/shared';
import { AppError } from '../middleware/errors.js';
import { buildHighRiskWorkOrderCard, type NotificationProvider } from '../providers/notification-provider.js';
import type { DataRepository } from '../repositories/data-repository.js';
import type { OperationsService } from './operations-service.js';

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

export function decryptFeishuPayload(encrypted: string, encryptKey: string): JsonObject {
  try {
    const payload = Buffer.from(encrypted, 'base64');
    if (payload.length <= 16) throw new Error('encrypted payload is too short');
    const key = createHash('sha256').update(encryptKey).digest();
    const decipher = createDecipheriv('aes-256-cbc', key, payload.subarray(0, 16));
    const plaintext = Buffer.concat([decipher.update(payload.subarray(16)), decipher.final()]).toString('utf8');
    return asObject(JSON.parse(plaintext));
  } catch {
    throw new AppError(401, 'INVALID_ENCRYPTED_EVENT', '飞书加密回调解密失败');
  }
}

export function redactSensitiveText(value: string) {
  return value
    .replace(/(app[_-]?secret|verification[_-]?token|encrypt[_-]?key|access[_-]?token)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, 'Bearer [REDACTED]');
}

export function safeSecretEqual(actual: unknown, expected?: string) {
  if (!expected || typeof actual !== 'string') return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function parseTextMessage(payload: JsonObject) {
  const event = asObject(payload.event);
  const message = asObject(event.message);
  if (message.message_type !== 'text' || typeof message.content !== 'string') return undefined;
  try {
    const content = asObject(JSON.parse(message.content));
    if (typeof content.text !== 'string') return undefined;
    let text = content.text;
    const mentions = Array.isArray(message.mentions) ? message.mentions : [];
    for (const mention of mentions) {
      const key = asObject(mention).key;
      if (typeof key === 'string' && key) text = text.replaceAll(key, ' ');
    }
    text = text.replace(/@_user_\d+/g, ' ').replace(/\s+/g, ' ').trim();
    return text || undefined;
  } catch {
    return undefined;
  }
}

function trustedOperatorLabel(payload: JsonObject) {
  const operator = asObject(asObject(payload.event).operator);
  const identifier = [operator.user_id, operator.open_id, operator.union_id]
    .find((value): value is string => typeof value === 'string' && value.length > 0);
  if (!identifier) return '飞书用户';
  return `飞书用户#${createHash('sha256').update(identifier).digest('hex').slice(0, 8)}`;
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

class EventIdempotencyStore {
  private readonly memory = new Set<string>();
  private readonly inFlight = new Set<string>();
  constructor(private readonly repository: DataRepository) {}

  async begin(eventId: string) {
    if (this.memory.has(eventId) || this.inFlight.has(eventId)) return false;
    try {
      const logs = await this.repository.listOperationLogs(eventId);
      if (logs.some((log) => log.entityType === 'feishu-event' && log.action === '处理飞书回调')) {
        this.memory.add(eventId);
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
    this.memory.add(eventId);
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
      if (actionValue.action === 'accept_work_order') result = await this.withWorkOrderLock(String(actionValue.workOrderId ?? actionValue.workOrderNo ?? ''), () => this.acceptWorkOrder(actionValue, eventId, operator));
      else if (actionValue.action === 'defer_work_order') result = await this.deferWorkOrder(actionValue, operator);
      else if (actionValue.action === 'acknowledge' && actionValue.alertId) result = await this.acknowledgeAlert(String(actionValue.alertId), operator);
      else if (actionValue.action === 'create_work_order' && actionValue.alertId) result = await this.createWorkOrder(String(actionValue.alertId), eventId, operator);
      else if (eventType === 'im.message.receive_v1') result = await this.replyToMessage(payload);
      else result = { success: true, data: { received: true, eventId } };

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
    const identifier = String(value.workOrderId ?? value.workOrderNo ?? '');
    if (!identifier) throw new AppError(400, 'WORK_ORDER_IDENTIFIER_MISSING', '卡片回调缺少工单标识');
    const current = await this.repository.getWorkOrder(identifier);
    if (!current) throw new AppError(404, 'WORK_ORDER_NOT_FOUND', `未找到维修工单：${String(value.workOrderNo ?? identifier)}`);
    if (current.status !== '待接单') return workOrderCardResponse(current, `工单当前状态已是${current.status}，未重复推进`);
    const updated = await this.operations.transitionWorkOrder(current.recordId || current.id || current.workOrderNo, {
      targetStatus: '已接单',
      operator,
      note: '通过飞书高风险工单卡片确认接单',
      idempotencyKey: `feishu-event-${eventId}-accept`,
    });
    return workOrderCardResponse(updated, `接单成功：${updated.workOrderNo}`);
  }

  private async deferWorkOrder(value: JsonObject, operator: string) {
    const identifier = String(value.workOrderId ?? value.workOrderNo ?? '');
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

  private async replyToMessage(payload: JsonObject) {
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
    const diagnosis = await this.operations.diagnose(undefined, question);
    const delivery = await this.notifications.sendText(formatDiagnosisForFeishu(diagnosis), chatId, 'chat_id');
    if (!delivery.delivered) throw new AppError(502, 'BOT_REPLY_FAILED', delivery.error ?? '机器人回复发送失败');
    return { success: true, data: { replied: true, messageId: delivery.messageId, intent: diagnosis.intent } };
  }
}
