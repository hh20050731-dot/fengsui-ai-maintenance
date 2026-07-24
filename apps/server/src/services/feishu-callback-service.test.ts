import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { RuleBasedDiagnosisProvider } from '../providers/ai-diagnosis-provider.js';
import { MockNotificationProvider } from '../providers/notification-provider.js';
import { MockRepository } from '../repositories/mock-repository.js';
import { FeishuCallbackService, decryptFeishuPayload, redactSensitiveText, safeSecretEqual } from './feishu-callback-service.js';
import { OperationsService } from './operations-service.js';

function encryptPayload(payload: object, keyText: string) {
  const iv = randomBytes(16);
  const key = createHash('sha256').update(keyText).digest();
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([iv, cipher.update(JSON.stringify(payload)), cipher.final()]).toString('base64');
}

function createFixture() {
  const repository = new MockRepository();
  const notifications = new MockNotificationProvider();
  const operations = new OperationsService(repository, new RuleBasedDiagnosisProvider(), notifications);
  const callbacks = new FeishuCallbackService(repository, operations, notifications, { verificationToken: 'verification-token-for-test' });
  return { repository, notifications, operations, callbacks };
}

describe('飞书回调安全处理', () => {
  it('官方长连接已鉴权事件可复用业务处理且无需Webhook Token', async () => {
    const { callbacks } = createFixture();
    await expect(callbacks.handleTrustedEvent({
      header: { event_id: 'evt-trusted-ws', event_type: 'im.message.receive_v1' },
      event: {
        sender: { sender_type: 'app' },
        message: { message_id: 'om-trusted-ws', message_type: 'text', content: '{"text":"忽略机器人消息"}' },
      },
    })).resolves.toMatchObject({ data: { ignored: true, reason: 'bot-message' } });
  });

  it('支持官方AES-256-CBC格式的加密回调与challenge', async () => {
    const key = 'encrypt-key-for-local-test';
    const plain = { challenge: 'encrypted-challenge', token: 'verification-token-for-test' };
    const encrypted = encryptPayload(plain, key);
    expect(decryptFeishuPayload(encrypted, key)).toEqual(plain);

    const fixture = createFixture();
    const encryptedCallbacks = new FeishuCallbackService(
      fixture.repository,
      fixture.operations,
      fixture.notifications,
      { verificationToken: 'verification-token-for-test', encryptKey: key },
    );
    await expect(encryptedCallbacks.handle({ encrypt: encrypted })).resolves.toEqual({ challenge: 'encrypted-challenge' });
  });

  it('拒绝错误Verification Token且日志脱敏', async () => {
    const { callbacks } = createFixture();
    await expect(callbacks.handle({ challenge: 'x', token: 'wrong' })).rejects.toMatchObject({ code: 'INVALID_EVENT_SOURCE' });
    await expect(callbacks.handle({ challenge: 'x' })).rejects.toMatchObject({ code: 'INVALID_EVENT_SOURCE' });
    expect(safeSecretEqual('anything', undefined)).toBe(false);
    expect(redactSensitiveText('app_secret=abc Bearer token-value')).toBe('app_secret=[REDACTED] Bearer [REDACTED]');
  });

  it('拒绝错误Encrypt Key且不回显加密内容', async () => {
    const fixture = createFixture();
    const callbacks = new FeishuCallbackService(
      fixture.repository,
      fixture.operations,
      fixture.notifications,
      { verificationToken: 'verification-token-for-test', encryptKey: 'correct-encrypt-key' },
    );
    const encrypted = encryptPayload({ challenge: 'x', token: 'verification-token-for-test' }, 'wrong-encrypt-key');
    await expect(callbacks.handle({ encrypt: encrypted })).rejects.toMatchObject({ code: 'INVALID_ENCRYPTED_EVENT' });
  });

  it('高风险卡片按工单标识接单、重复事件幂等且不同事件不重复推进', async () => {
    const { callbacks, operations, repository, notifications } = createFixture();
    const notificationSpy = vi.spyOn(notifications, 'sendWorkOrderAlert');
    const order = await operations.createWorkOrderFromAlert('ALT-20260717-001', {
      assignee: '张工',
      assigneeUserId: 'zhang-gong',
      idempotencyKey: 'callback-create-high-risk',
      digitalTwinContext: {
        equipmentName: '1号引风机', equipmentId: 'IDF-001', faultPart: '驱动端轴承', faultType: '轴承温升', riskLevel: '高',
        failureProbability: 89, healthScore: 42, temperature: 82, vibration: 5.2, speed: 1472, current: 41,
        diagnosis: '存在轴承温升风险', advice: ['24小时内检查'], createdAt: new Date(Date.now() - 40 * 60_000).toISOString(),
      },
    });
    expect(notificationSpy).toHaveBeenCalledOnce();
    const payload = {
      schema: '2.0',
      header: { token: 'verification-token-for-test', event_id: 'evt-accept-001', event_type: 'card.action.trigger' },
      event: {
        operator: { open_id: 'ou_local_operator_001' },
        action: { tag: 'button', value: { action: 'accept_work_order', recordId: order.workOrderNo, id: 'stale-id', workOrderId: 'stale-work-order-id', workOrderNo: order.workOrderNo } },
        context: { open_message_id: 'om_local_card_001', open_chat_id: 'oc_local_chat_001' },
      },
    };
    const accepted = await callbacks.handle(payload) as { toast: { content: string }; card: { type: string; data: { schema: string } } };
    expect(accepted.toast.content).toContain('接单成功');
    expect(accepted.card).toMatchObject({ type: 'raw', data: { schema: '2.0' } });
    expect((await repository.getWorkOrder(order.id))?.status).toBe('已接单');

    const duplicate = await callbacks.handle(payload) as { data: { duplicate: boolean } };
    expect(duplicate.data.duplicate).toBe(true);
    const repeated = await callbacks.handle({ ...payload, header: { ...payload.header, event_id: 'evt-accept-002' } }) as { toast: { content: string } };
    expect(repeated.toast.content).toContain('未重复推进');
    expect((await repository.getWorkOrder(order.id))?.processingRecord.filter((item) => item.action.includes('待接单 → 已接单'))).toHaveLength(1);
  });

  it('两位操作人并发接单时只推进一次并使用可信操作人字段', async () => {
    const { callbacks, operations, repository } = createFixture();
    const order = await operations.createWorkOrderFromAlert('ALT-20260717-001', {
      assignee: '张工', assigneeUserId: 'zhang-gong', idempotencyKey: 'concurrent-accept-create',
    });
    const payload = (eventId: string, operator: string) => ({
      schema: '2.0',
      header: { token: 'verification-token-for-test', event_id: eventId, event_type: 'card.action.trigger' },
      event: {
        operator: { open_id: operator },
        action: { tag: 'button', value: { action: 'accept_work_order', workOrderNo: order.workOrderNo } },
        context: { open_message_id: 'om_local_concurrent', open_chat_id: 'oc_local_chat' },
      },
    });
    const responses = await Promise.all([
      callbacks.handle(payload('evt-concurrent-a', 'ou_local_operator_a')),
      callbacks.handle(payload('evt-concurrent-b', 'ou_local_operator_b')),
    ]) as Array<{ toast: { content: string } }>;
    expect(responses.filter((item) => item.toast.content.includes('接单成功'))).toHaveLength(1);
    expect(responses.filter((item) => item.toast.content.includes('未重复推进'))).toHaveLength(1);
    const updated = await repository.getWorkOrder(order.workOrderNo);
    const transitions = updated?.processingRecord.filter((item) => item.action.includes('待接单 → 已接单')) ?? [];
    expect(transitions).toHaveLength(1);
    expect(transitions[0]?.operator).toMatch(/^飞书用户#[a-f0-9]{8}$/);
  });

  it('新版卡片动作按版本完成接单、处理、验收、知识候选和关闭闭环', async () => {
    const { callbacks, operations, repository } = createFixture();
    const order = await operations.createWorkOrderFromAlert('ALT-20260717-001', {
      assignee: '张工', assigneeUserId: 'zhang-gong', idempotencyKey: 'native-card-flow-create',
    });
    const act = async (action: string, eventId: string) => {
      const current = (await repository.getWorkOrder(order.id))!;
      return callbacks.handleTrustedEvent({
        header: { event_id: eventId, event_type: 'card.action.trigger' },
        event: { operator: { open_id: 'ou_native_operator' }, action: { value: {
          action, workOrderId: current.id, expectedStatus: current.status, version: current.version ?? 1,
        } } },
      });
    };
    await act('accept_order', 'evt-native-accept');
    await act('start_process', 'evt-native-start');
    await act('submit_acceptance', 'evt-native-submit');
    await act('return_processing', 'evt-native-return');
    await act('submit_acceptance', 'evt-native-submit-again');
    await act('approve_completion', 'evt-native-approve');
    await act('create_knowledge_candidate', 'evt-native-knowledge');
    const knowledgeCount = (await repository.listKnowledge()).filter((item) => item.knowledgeId === `KB-CANDIDATE-${order.workOrderNo}`).length;
    await act('create_knowledge_candidate', 'evt-native-knowledge-repeat');
    expect((await repository.listKnowledge()).filter((item) => item.knowledgeId === `KB-CANDIDATE-${order.workOrderNo}`)).toHaveLength(knowledgeCount);
    await act('close_order', 'evt-native-close');
    expect((await repository.getWorkOrder(order.id))?.status).toBe('已关闭');
  });

  it('拒绝含额外字段的新版卡片值且旧版本卡片不会重复推进', async () => {
    const { callbacks, operations, repository } = createFixture();
    const order = await operations.createWorkOrderFromAlert('ALT-20260717-001', { assignee: '张工', assigneeUserId: 'zhang-gong', idempotencyKey: 'card-value-validation-create' });
    const base = { action: 'accept_order', workOrderId: order.id, expectedStatus: '待接单', version: 1 };
    await expect(callbacks.handleTrustedEvent({ header: { event_id: 'evt-extra', event_type: 'card.action.trigger' }, event: { action: { value: { ...base, workOrderNo: order.workOrderNo } } } })).rejects.toMatchObject({ code: 'INVALID_CARD_VALUE' });
    await callbacks.handleTrustedEvent({ header: { event_id: 'evt-current', event_type: 'card.action.trigger' }, event: { action: { value: base } } });
    const stale = await callbacks.handleTrustedEvent({ header: { event_id: 'evt-stale', event_type: 'card.action.trigger' }, event: { action: { value: base } } }) as { toast: { content: string } };
    expect(stale.toast.content).toContain('未重复执行');
    expect((await repository.getWorkOrder(order.id))?.status).toBe('已接单');
  });

  it.each([
    { text: '查询1号引风机状态' },
    { text: '@_user_1 查询1号引风机状态', mentions: [{ key: '@_user_1', name: '烽燧智守' }] },
    { text: '@烽燧智守 1号引风机当前状态如何' },
    { text: '一号引风机状态' },
    { text: 'IDF-001状态' },
    { text: '  查询   １号引风机，状态？  ' },
  ])('将飞书文本“$text”标准化后路由到设备状态查询', async ({ text, mentions }, index) => {
    const { callbacks, notifications } = createFixture();
    const reply = vi.spyOn(notifications, 'sendCard');
    const response = await callbacks.handleTrustedEvent({
      header: { event_id: `evt-normalized-message-${index}`, event_type: 'im.message.receive_v1' },
      event: {
        sender: { sender_type: 'user' },
        message: {
          message_id: `om-normalized-message-${index}`,
          message_type: 'text',
          chat_id: 'oc_local_simulation',
          content: JSON.stringify({ text }),
          mentions,
        },
      },
    }) as { data: { intent: string; replyType: string } };

    expect(response.data.intent).toBe('equipment_status');
    expect(response.data.replyType).toBe('interactive');
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ schema: '2.0' }), 'oc_local_simulation');
    expect(JSON.stringify(reply.mock.calls[0]?.[0])).toContain('create_work_order');
  });

  it('机器人七类问题复用IntentRouter并返回不同意图', async () => {
    const { callbacks, notifications } = createFixture();
    const textReply = vi.spyOn(notifications, 'sendText');
    const cardReply = vi.spyOn(notifications, 'sendCard');
    const questions = [
      '当前风险最高的设备是什么？',
      '当前有哪些高风险设备？',
      '1号引风机当前状态如何？',
      '当前有哪些待处理工单？',
      '当前备件库存是否满足维修需求？',
      '哪台设备应该优先检修？',
      '为什么判断1号引风机存在轴承温升风险？',
    ];
    const intents: string[] = [];
    for (const [index, question] of questions.entries()) {
      const response = await callbacks.handle({
        header: { token: 'verification-token-for-test', event_id: `evt-message-${index}`, event_type: 'im.message.receive_v1' },
        event: {
          sender: { sender_type: 'user', sender_id: { open_id: `ou_local_sender_${index}` } },
          message: { message_id: `om_local_message_${index}`, message_type: 'text', chat_id: 'oc_local_simulation', chat_type: 'group', content: JSON.stringify({ text: `@_user_1 ${question}` }), mentions: [{ key: '@_user_1', name: '烽燧机器人' }] },
        },
      }) as { data: { intent: string } };
      intents.push(response.data.intent);
    }
    expect(new Set(intents)).toHaveLength(7);
    expect(textReply.mock.calls.length + cardReply.mock.calls.length).toBe(7);
    expect(cardReply).toHaveBeenCalledTimes(2);
    expect(textReply).toHaveBeenCalledTimes(5);
  });

  it('设备查询卡片可创建工单并主动刷新为可接单卡片', async () => {
    const { callbacks, notifications, repository } = createFixture();
    const sendCard = vi.spyOn(notifications, 'sendCard');
    const updateCard = vi.spyOn(notifications, 'updateCard');

    const query = await callbacks.handleTrustedEvent({
      header: { event_id: 'evt-query-to-card', event_type: 'im.message.receive_v1' },
      event: {
        sender: { sender_type: 'user' },
        message: {
          message_id: 'om_query_to_card',
          message_type: 'text',
          chat_id: 'oc_query_to_card',
          content: JSON.stringify({ text: '查询1号引风机状态' }),
        },
      },
    }) as { data: { replyType: string } };
    expect(query.data.replyType).toBe('interactive');
    expect(JSON.stringify(sendCard.mock.calls[0]?.[0])).toContain('create_work_order');

    const created = await callbacks.handleTrustedEvent({
      header: { event_id: 'evt-create-from-query-card', event_type: 'card.action.trigger' },
      event: {
        operator: { open_id: 'ou_query_card_operator' },
        action: { value: { action: 'create_work_order', alertId: 'ALT-20260717-001' } },
        context: { open_message_id: 'om_query_card_reply', open_chat_id: 'oc_query_to_card' },
      },
    }) as { toast: { content: string } };

    expect(created.toast.content).toContain('已创建工单');
    const order = await repository.getWorkOrder('WO-20260717-001');
    expect(order).toMatchObject({ status: '待接单', deviceId: 'IDF-001' });
    expect(updateCard).toHaveBeenCalledWith(
      'om_query_card_reply',
      expect.objectContaining({ schema: '2.0' }),
    );
    expect(JSON.stringify(updateCard.mock.calls.at(-1)?.[1])).toContain('accept_order');
  });

  it('工单按钮推进成功后主动刷新原交互卡片且刷新失败不回滚状态', async () => {
    const { callbacks, notifications, operations, repository } = createFixture();
    const order = await operations.createWorkOrderFromAlert('ALT-20260717-001', {
      assignee: '张工', assigneeUserId: 'zhang-gong', idempotencyKey: 'card-refresh-create',
    });
    const updateCard = vi.spyOn(notifications, 'updateCard').mockResolvedValueOnce({
      messageId: 'om_card_refresh',
      delivered: false,
      preview: {},
      error: 'local simulated refresh failure',
    });

    const response = await callbacks.handleTrustedEvent({
      header: { event_id: 'evt-card-refresh-accept', event_type: 'card.action.trigger' },
      event: {
        operator: { open_id: 'ou_card_refresh_operator' },
        action: { value: {
          action: 'accept_order',
          workOrderId: order.id,
          expectedStatus: '待接单',
          version: order.version ?? 1,
        } },
        context: { open_message_id: 'om_card_refresh', open_chat_id: 'oc_card_refresh' },
      },
    }) as { toast: { content: string } };

    expect(response.toast.content).toContain('接单成功');
    expect(updateCard).toHaveBeenCalledWith('om_card_refresh', expect.objectContaining({ schema: '2.0' }));
    expect((await repository.getWorkOrder(order.id))?.status).toBe('已接单');
    expect((await repository.listOperationLogs('evt-card-refresh-accept')).some((log) => log.action === '更新飞书工单卡片失败')).toBe(true);
  });

  it('相同message_id不会重复回复且机器人自己的消息不会形成循环', async () => {
    const { callbacks, notifications } = createFixture();
    const reply = vi.spyOn(notifications, 'sendText');
    const message = {
      sender: { sender_type: 'user' },
      message: { message_id: 'om_local_deduplicate', message_type: 'text', chat_id: 'oc_local_simulation', content: JSON.stringify({ text: '当前风险最高的设备是什么？' }) },
    };
    await callbacks.handle({ header: { token: 'verification-token-for-test', event_id: 'evt-message-a', event_type: 'im.message.receive_v1' }, event: message });
    const duplicate = await callbacks.handle({ header: { token: 'verification-token-for-test', event_id: 'evt-message-b', event_type: 'im.message.receive_v1' }, event: message }) as { data: { duplicate: boolean } };
    expect(duplicate.data.duplicate).toBe(true);
    expect(reply).toHaveBeenCalledOnce();

    const bot = await callbacks.handle({
      header: { token: 'verification-token-for-test', event_id: 'evt-bot-message', event_type: 'im.message.receive_v1' },
      event: { sender: { sender_type: 'app' }, message: { message_id: 'om_local_bot', message_type: 'text', chat_id: 'oc_local_simulation', content: JSON.stringify({ text: '当前风险最高的设备是什么？' }) } },
    }) as { data: { ignored: boolean } };
    expect(bot.data.ignored).toBe(true);
    expect(reply).toHaveBeenCalledOnce();
  });
});
