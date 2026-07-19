import type { FeishuCallbackObject } from './feishu-callback-envelope.js';

type CallbackResult = Record<string, unknown>;
type CallbackRuntime = {
  callbackService: { handle(payload: FeishuCallbackObject): Promise<unknown> };
  notificationProvider: {
    updateCard(messageId: string, card: Record<string, unknown>): Promise<{ delivered: boolean }>;
    sendText(text: string, recipient?: string, receiveIdType?: 'chat_id' | 'open_id'): Promise<{ delivered: boolean }>;
  };
};

let runtimePromise: Promise<CallbackRuntime> | undefined;

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function getRuntime(): Promise<CallbackRuntime> {
  runtimePromise ??= import('../app.js').then(({ createApp }) => createApp());
  return runtimePromise;
}

function getCardContext(payload: FeishuCallbackObject) {
  const event = asObject(payload.event);
  const context = asObject(event.context);
  return {
    messageId: typeof context.open_message_id === 'string' ? context.open_message_id : undefined,
    chatId: typeof context.open_chat_id === 'string' ? context.open_chat_id : undefined,
  };
}

async function notifyCardFailure(runtime: CallbackRuntime, payload: FeishuCallbackObject) {
  const { messageId, chatId } = getCardContext(payload);
  const failureCard = {
    schema: '2.0',
    header: {
      template: 'red',
      title: { tag: 'plain_text', content: '工单操作同步失败' },
    },
    body: {
      elements: [{
        tag: 'markdown',
        content: '操作请求已受理，但后台同步失败。请返回网站检查工单状态后重试。',
      }],
    },
  };
  if (messageId) {
    await runtime.notificationProvider.updateCard(messageId, failureCard);
    return;
  }
  if (chatId) {
    await runtime.notificationProvider.sendText(
      '工单操作后台同步失败，请返回网站检查工单状态后重试。',
      chatId,
      'chat_id',
    );
  }
}

async function handleWithRuntime(runtime: CallbackRuntime, payload: FeishuCallbackObject) {
  try {
    const result = await runtime.callbackService.handle(payload);
    const resultObject = asObject(result) as CallbackResult;
    const card = asObject(resultObject.card);
    const cardData = asObject(card.data);
    const { messageId } = getCardContext(payload);
    if (messageId && Object.keys(cardData).length > 0) {
      const update = await runtime.notificationProvider.updateCard(messageId, cardData);
      if (!update.delivered) throw new Error('card update failed');
    }
    return result;
  } catch (error) {
    try {
      await notifyCardFailure(runtime, payload);
    } catch {
      console.error('[feishu-callback-background] {"notification_failed":true}');
    }
    throw error;
  }
}

export async function prepareFeishuCallbackRuntime() {
  const runtime = await getRuntime();
  return {
    handle: (payload: FeishuCallbackObject) => handleWithRuntime(runtime, payload),
  };
}
