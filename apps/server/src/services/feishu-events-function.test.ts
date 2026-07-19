import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createFeishuCallbackHandler } from '../../../../api/feishu/events.js';

const verificationToken = 'verification-token-for-callback-test';

function encryptPayload(payload: object, keyText: string) {
  const iv = randomBytes(16);
  const key = createHash('sha256').update(keyText).digest();
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([iv, cipher.update(JSON.stringify(payload)), cipher.final()]).toString('base64');
}

function requestWith(body: unknown, method = 'POST') {
  return {
    method,
    body,
    async *[Symbol.asyncIterator]() {
      // Vercel normally exposes a parsed body; the iterator keeps this fixture compatible with raw requests.
    },
  };
}

function responseFixture() {
  let rawBody = '';
  let ended = false;
  const headers = new Map<string, string>();
  const response = {
    statusCode: 0,
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
    },
    end(body = '') {
      rawBody = body;
      ended = true;
    },
  };
  return {
    response,
    get status() { return response.statusCode; },
    get body() { return rawBody ? JSON.parse(rawBody) as unknown : undefined; },
    get ended() { return ended; },
    headers,
  };
}

function handlerFixture(overrides: Parameters<typeof createFeishuCallbackHandler>[0] = {}) {
  const backgroundTasks: Promise<unknown>[] = [];
  const runtimeHandle = vi.fn().mockResolvedValue({ success: true });
  const loadRuntime = vi.fn().mockResolvedValue({ handle: runtimeHandle });
  const logger = { info: vi.fn(), error: vi.fn() };
  const handler = createFeishuCallbackHandler({
    verificationToken,
    waitUntil: (promise) => { backgroundTasks.push(promise); },
    loadRuntime,
    logger,
    ...overrides,
  });
  return { handler, backgroundTasks, runtimeHandle, loadRuntime, logger };
}

describe('飞书独立轻量回调入口', () => {
  it('明文challenge在100ms内直接返回且不初始化完整应用', async () => {
    const fixture = handlerFixture();
    const response = responseFixture();
    const startedAt = performance.now();
    await fixture.handler(requestWith({ token: verificationToken, challenge: 'challenge-plain' }), response.response);
    const elapsed = performance.now() - startedAt;

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ challenge: 'challenge-plain' });
    expect(elapsed).toBeLessThan(100);
    expect(fixture.loadRuntime).not.toHaveBeenCalled();
    expect(fixture.backgroundTasks).toHaveLength(0);
    expect(fixture.logger.info).toHaveBeenCalledOnce();
    expect(fixture.logger.info.mock.calls[0]?.[0]).toContain('"app_initialized_ms":0');
  });

  it('加密challenge解密校验后直接返回且不初始化完整应用', async () => {
    const encryptKey = 'encrypt-key-for-callback-test';
    const encrypted = encryptPayload({ token: verificationToken, challenge: 'challenge-encrypted' }, encryptKey);
    const fixture = handlerFixture({ encryptKey });
    const response = responseFixture();

    await fixture.handler(requestWith({ encrypt: encrypted }), response.response);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ challenge: 'challenge-encrypted' });
    expect(fixture.loadRuntime).not.toHaveBeenCalled();
  });

  it('缺失或错误Verification Token时快速返回401且不启动后台任务', async () => {
    for (const body of [{ challenge: 'missing-token' }, { token: 'wrong-token', challenge: 'wrong-token' }]) {
      const fixture = handlerFixture();
      const response = responseFixture();
      await fixture.handler(requestWith(body), response.response);
      expect(response.status).toBe(401);
      expect(fixture.loadRuntime).not.toHaveBeenCalled();
      expect(fixture.backgroundTasks).toHaveLength(0);
    }
  });

  it('非法JSON、超大请求体和非POST请求返回明确错误', async () => {
    const invalidFixture = handlerFixture();
    const invalidResponse = responseFixture();
    await invalidFixture.handler(requestWith('{invalid-json'), invalidResponse.response);
    expect(invalidResponse.status).toBe(400);
    expect(invalidResponse.body).toMatchObject({ error: { code: 'INVALID_JSON' } });

    const largeFixture = handlerFixture();
    const largeResponse = responseFixture();
    await largeFixture.handler(requestWith({ token: verificationToken, padding: 'x'.repeat(257 * 1024) }), largeResponse.response);
    expect(largeResponse.status).toBe(413);

    const methodFixture = handlerFixture();
    const methodResponse = responseFixture();
    await methodFixture.handler(requestWith({}, 'GET'), methodResponse.response);
    expect(methodResponse.status).toBe(405);
  });

  it('文本消息先返回200再通过waitUntil处理业务', async () => {
    const runtimeHandle = vi.fn().mockResolvedValue({ success: true });
    let resolveRuntime: ((value: { handle: typeof runtimeHandle }) => void) | undefined;
    const runtimePromise = new Promise<{ handle: typeof runtimeHandle }>((resolve) => { resolveRuntime = resolve; });
    const fixture = handlerFixture({ loadRuntime: () => runtimePromise });
    const response = responseFixture();
    const payload = {
      header: { token: verificationToken, event_id: 'evt-message-lightweight', event_type: 'im.message.receive_v1' },
      event: { message: { message_id: 'om-message-lightweight', message_type: 'text', content: '{"text":"当前有哪些高风险设备？"}' } },
    };

    await fixture.handler(requestWith(payload), response.response);

    expect(response.ended).toBe(true);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { accepted: true } });
    expect(fixture.backgroundTasks).toHaveLength(1);
    expect(runtimeHandle).not.toHaveBeenCalled();
    resolveRuntime?.({ handle: runtimeHandle });
    await Promise.all(fixture.backgroundTasks);
    expect(runtimeHandle).toHaveBeenCalledWith(payload);
  });

  it('卡片操作立即返回受理提示并在后台推进工单', async () => {
    const fixture = handlerFixture();
    const response = responseFixture();
    const payload = {
      header: { token: verificationToken, event_id: 'evt-card-lightweight', event_type: 'card.action.trigger' },
      event: {
        action: { value: { action: 'accept_work_order', workOrderNo: 'WO-TEST-001' } },
        context: { open_message_id: 'om-card-lightweight' },
      },
    };

    await fixture.handler(requestWith(payload), response.response);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ toast: { type: 'info', content: '操作已受理，正在同步工单状态' } });
    expect(fixture.backgroundTasks).toHaveLength(1);
    await Promise.all(fixture.backgroundTasks);
    expect(fixture.runtimeHandle).toHaveBeenCalledWith(payload);
  });

  it('卡片缺少稳定工单标识时拒绝提交且不启动后台处理', async () => {
    const fixture = handlerFixture();
    const response = responseFixture();
    await fixture.handler(requestWith({
      header: { token: verificationToken, event_type: 'card.action.trigger' },
      event: { action: { value: { action: 'accept_work_order' } } },
    }), response.response);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'WORK_ORDER_IDENTIFIER_MISSING' } });
    expect(fixture.backgroundTasks).toHaveLength(0);
  });

  it('后台失败不改变已返回的成功响应且日志不泄露异常内容', async () => {
    const sensitiveErrorText = 'do-not-log-this-value';
    const fixture = handlerFixture({
      loadRuntime: vi.fn().mockResolvedValue({
        handle: vi.fn().mockRejectedValue(new Error(sensitiveErrorText)),
      }),
    });
    const response = responseFixture();
    await fixture.handler(requestWith({
      header: { token: verificationToken, event_id: 'evt-background-error', event_type: 'im.message.receive_v1' },
      event: { message: { message_id: 'om-background-error', message_type: 'text', content: '{}' } },
    }), response.response);

    expect(response.status).toBe(200);
    await Promise.all(fixture.backgroundTasks);
    expect(fixture.logger.error).toHaveBeenCalledOnce();
    const logs = JSON.stringify([...fixture.logger.info.mock.calls, ...fixture.logger.error.mock.calls]);
    expect(logs).not.toContain(sensitiveErrorText);
    expect(logs).not.toContain(verificationToken);
  });

  it('耗时日志仅包含阶段数字，不记录challenge、Token或请求体', async () => {
    const fixture = handlerFixture();
    const response = responseFixture();
    const challenge = 'challenge-must-not-appear-in-logs';
    await fixture.handler(requestWith({ token: verificationToken, challenge }), response.response);

    const logs = JSON.stringify(fixture.logger.info.mock.calls);
    expect(logs).toContain('challenge_response_ms');
    expect(logs).not.toContain(challenge);
    expect(logs).not.toContain(verificationToken);
  });

  it('Vercel配置将回调映射到香港区域的独立函数', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
      functions: Record<string, { regions?: string[] }>;
      rewrites: Array<{ source: string; destination: string }>;
    };
    expect(config.functions['api/feishu/events.ts']?.regions).toEqual(['hkg1']);
    expect(config.rewrites[0]).toEqual({ source: '/api/feishu/events', destination: '/api/feishu/events' });
  });
});
