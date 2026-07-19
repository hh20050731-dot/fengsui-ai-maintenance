import { createHash } from 'node:crypto';

type JsonObject = Record<string, unknown>;
type FeishuWsEventType = 'im.message.receive_v1' | 'card.action.trigger';

export interface TrustedCallbackRuntime {
  handleTrusted(payload: JsonObject): Promise<unknown>;
}

type QueueTask = { label: string; run: () => Promise<void> };

export class ControlledTaskQueue {
  private readonly tasks: QueueTask[] = [];
  private running = false;
  private accepting = true;
  private drainPromise: Promise<void> = Promise.resolve();

  constructor(private readonly onError: (label: string) => void) {}

  enqueue(label: string, run: () => Promise<void>) {
    if (!this.accepting) return false;
    this.tasks.push({ label, run });
    if (!this.running) setImmediate(() => { void this.drain(); });
    return true;
  }

  async close() {
    this.accepting = false;
    if (this.tasks.length > 0 && !this.running) void this.drain();
    await this.drainPromise;
  }

  private drain() {
    if (this.running) return this.drainPromise;
    this.running = true;
    this.drainPromise = (async () => {
      while (this.tasks.length > 0) {
        const task = this.tasks.shift();
        if (!task) continue;
        try {
          await task.run();
        } catch {
          this.onError(task.label);
        }
      }
    })().finally(() => {
      this.running = false;
    });
    return this.drainPromise;
  }
}

function asObject(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function stableEventId(eventType: FeishuWsEventType, data: JsonObject) {
  if (typeof data.event_id === 'string' && data.event_id) return data.event_id;
  const message = asObject(data.message);
  if (eventType === 'im.message.receive_v1' && typeof message.message_id === 'string' && message.message_id) {
    return `message:${message.message_id}`;
  }
  const context = asObject(data.context);
  const action = asObject(data.action);
  return `ws:${createHash('sha256').update(JSON.stringify({
    eventType,
    messageId: context.open_message_id,
    action: action.value,
  })).digest('hex')}`;
}

export function toTrustedCallbackPayload(eventType: FeishuWsEventType, rawData: unknown) {
  const data = asObject(rawData);
  const eventId = stableEventId(eventType, data);
  return {
    schema: '2.0',
    header: {
      event_id: eventId,
      event_type: eventType,
      create_time: data.create_time,
      tenant_key: data.tenant_key,
      app_id: data.app_id,
    },
    event: data,
  };
}

function summarizeResult(eventType: FeishuWsEventType, result: unknown) {
  const resultObject = asObject(result);
  const data = asObject(resultObject.data);
  if (data.duplicate === true) return `${eventType}:duplicate`;
  if (data.ignored === true) return `${eventType}:ignored`;
  return `${eventType}:success`;
}

export function createFeishuWsEventHandlers(options: {
  queue: ControlledTaskQueue;
  loadRuntime: () => Promise<TrustedCallbackRuntime>;
  log: (message: string) => void;
}) {
  const schedule = (eventType: FeishuWsEventType, data: unknown) => {
    options.log(`[Feishu WS] event received: ${eventType}`);
    const payload = toTrustedCallbackPayload(eventType, data);
    const accepted = options.queue.enqueue(eventType, async () => {
      const runtime = await options.loadRuntime();
      const result = await runtime.handleTrusted(payload);
      options.log(`[Feishu WS] handled: ${summarizeResult(eventType, result)}`);
    });
    if (!accepted) options.log(`[Feishu WS] handled: ${eventType}:queue-closed`);
  };

  return {
    'im.message.receive_v1': async (data: unknown) => {
      schedule('im.message.receive_v1', data);
    },
    'card.action.trigger': async (data: unknown) => {
      schedule('card.action.trigger', data);
      return {
        toast: { type: 'info', content: '操作已受理，正在同步工单状态' },
      };
    },
  };
}
