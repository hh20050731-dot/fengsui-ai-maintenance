import { describe, expect, it, vi } from 'vitest';
import {
  ControlledTaskQueue,
  createFeishuWsEventHandlers,
  toTrustedCallbackPayload,
} from './feishu-ws-bridge.js';

describe('飞书 WebSocket 长连接桥接', () => {
  it('将SDK扁平消息事件转换为现有回调服务结构', () => {
    const payload = toTrustedCallbackPayload('im.message.receive_v1', {
      event_id: 'evt-ws-message-001',
      message: { message_id: 'om-ws-message-001', content: '{"text":"当前有哪些高风险设备？"}' },
    });
    expect(payload).toMatchObject({
      header: { event_id: 'evt-ws-message-001', event_type: 'im.message.receive_v1' },
      event: { message: { message_id: 'om-ws-message-001' } },
    });
  });

  it('消息事件立即应答并由受控队列复用可信回调业务', async () => {
    const logs: string[] = [];
    const errors: string[] = [];
    const handleTrusted = vi.fn().mockResolvedValue({ success: true, data: { replied: true } });
    const queue = new ControlledTaskQueue((label) => errors.push(label));
    const handlers = createFeishuWsEventHandlers({
      queue,
      loadRuntime: async () => ({ handleTrusted }),
      log: (message) => logs.push(message),
    });
    const rawEvent = {
      event_id: 'evt-ws-message-002',
      message: { message_id: 'om-ws-message-002', content: '{"text":"不可写入日志的消息全文"}' },
    };

    await expect(handlers['im.message.receive_v1'](rawEvent)).resolves.toBeUndefined();
    await queue.close();

    expect(handleTrusted).toHaveBeenCalledOnce();
    expect(handleTrusted.mock.calls[0]?.[0]).toMatchObject({
      header: { event_type: 'im.message.receive_v1' },
      event: rawEvent,
    });
    expect(errors).toHaveLength(0);
    expect(logs).toEqual([
      '[Feishu WS] event received: im.message.receive_v1',
      '[Feishu WS] handled: im.message.receive_v1:success',
    ]);
    expect(JSON.stringify(logs)).not.toContain('不可写入日志的消息全文');
  });

  it('新版卡片回调立即返回toast并在队列中继续处理', async () => {
    let releaseRuntime: (() => void) | undefined;
    const runtimeGate = new Promise<void>((resolve) => { releaseRuntime = resolve; });
    const handleTrusted = vi.fn(async (_payload: unknown) => {
      await runtimeGate;
      return { toast: { type: 'success', content: '接单成功' } };
    });
    const logs: string[] = [];
    const queue = new ControlledTaskQueue(() => undefined);
    const handlers = createFeishuWsEventHandlers({
      queue,
      loadRuntime: async () => ({ handleTrusted }),
      log: (message) => logs.push(message),
    });
    const rawEvent = {
      event_id: 'evt-ws-card-001',
      context: { open_message_id: 'om-ws-card-001' },
      action: { value: { action: 'accept_work_order', workOrderId: 'rec-test-001', workOrderNo: 'WO-TEST-001' } },
    };

    await expect(handlers['card.action.trigger'](rawEvent)).resolves.toEqual({
      toast: { type: 'info', content: '操作已受理，正在同步工单状态' },
    });
    expect(handleTrusted).not.toHaveBeenCalled();
    releaseRuntime?.();
    await queue.close();

    expect(handleTrusted).toHaveBeenCalledOnce();
    expect(handleTrusted.mock.calls[0]?.[0]).toMatchObject({
      header: { event_id: 'evt-ws-card-001', event_type: 'card.action.trigger' },
      event: rawEvent,
    });
    expect(logs).toContain('[Feishu WS] handled: card.action.trigger:success');
    expect(JSON.stringify(logs)).not.toContain('rec-test-001');
  });

  it('业务异常只输出事件类型且不会打断后续队列任务', async () => {
    const failures: string[] = [];
    const completed: string[] = [];
    const queue = new ControlledTaskQueue((label) => failures.push(label));
    queue.enqueue('card.action.trigger', async () => {
      throw new Error('secret-message-that-must-not-be-logged');
    });
    queue.enqueue('im.message.receive_v1', async () => {
      completed.push('next-task-ran');
    });

    await queue.close();

    expect(failures).toEqual(['card.action.trigger']);
    expect(completed).toEqual(['next-task-ran']);
    expect(JSON.stringify(failures)).not.toContain('secret-message-that-must-not-be-logged');
  });
});
