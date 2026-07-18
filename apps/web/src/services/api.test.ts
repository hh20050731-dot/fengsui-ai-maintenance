import { beforeEach, describe, expect, it, vi } from 'vitest';

function installBrowserGlobals() {
  const values = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
    setTimeout,
    clearTimeout,
  });
}

function jsonResponse(data: unknown, mode: 'mock' | 'feishu') {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'x-fengsui-mode': mode },
  });
}

describe('API 飞书工单写入保护', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    installBrowserGlobals();
  });

  it('飞书写请求传输失败时不回退或重放到浏览器 Mock', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ requestedMode: 'feishu' }, 'feishu'))
      .mockRejectedValueOnce(new TypeError('network timeout'));
    vi.stubGlobal('fetch', fetchMock);

    const client = await import('./api');
    await client.api('/integration/status');

    await expect(client.postJson('/work-orders/rec-test/transition', {
      targetStatus: '已接单',
      idempotencyKey: 'transition-test-001',
    })).rejects.toMatchObject({ code: 'FEISHU_WRITE_STATUS_UNKNOWN' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(client.isOfflineDemoTransport()).toBe(false);
  });
});
