import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeishuClient } from './feishu-client.js';

function jsonResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('FeishuClient访问凭证生命周期', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('tenant_access_token失效后刷新一次并重放原请求', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'local-token-first', expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ code: 99991663, msg: 'tenant token invalid' }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'local-token-refreshed', expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { ok: true } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(new FeishuClient().request<{ ok: boolean }>('/local/token-retry')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/tenant_access_token/internal'))).toHaveLength(2);
  });

  it('刷新后仍失败时返回统一飞书API错误且不会无限重试', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'local-token-first', expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ code: 99991663, msg: 'tenant token invalid' }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'local-token-refreshed', expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ code: 99991663, msg: 'tenant token invalid' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(new FeishuClient().request('/local/token-retry')).rejects.toMatchObject({ code: 'FEISHU_API_ERROR' });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
