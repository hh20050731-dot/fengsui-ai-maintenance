import { env } from '../config/env.js';
import { AppError } from '../middleware/errors.js';

interface FeishuEnvelope<T> { code: number; msg?: string; message?: string; data?: T; tenant_access_token?: string; app_access_token?: string; expire?: number }

export class FeishuClient {
  private tenantToken?: { value: string; expiresAt: number };
  private appToken?: { value: string; expiresAt: number };

  async getTenantAccessToken(): Promise<string> {
    if (this.tenantToken && this.tenantToken.expiresAt > Date.now() + 60_000) return this.tenantToken.value;
    const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ app_id: env.FEISHU_APP_ID, app_secret: env.FEISHU_APP_SECRET }),
    });
    const result = await response.json() as FeishuEnvelope<never>;
    if (!response.ok || result.code !== 0 || !result.tenant_access_token) throw new AppError(502, 'FEISHU_TOKEN_ERROR', `无法获取飞书应用凭证：${result.msg ?? response.status}`);
    this.tenantToken = { value: result.tenant_access_token, expiresAt: Date.now() + (result.expire ?? 7200) * 1000 };
    return result.tenant_access_token;
  }

  async getAppAccessToken(): Promise<string> {
    if (this.appToken && this.appToken.expiresAt > Date.now() + 60_000) return this.appToken.value;
    const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ app_id: env.FEISHU_APP_ID, app_secret: env.FEISHU_APP_SECRET }),
    });
    const result = await response.json() as FeishuEnvelope<never>;
    if (!response.ok || result.code !== 0 || !result.app_access_token) throw new AppError(502, 'FEISHU_APP_TOKEN_ERROR', `无法获取飞书应用授权凭证：${result.msg ?? response.status}`);
    this.appToken = { value: result.app_access_token, expiresAt: Date.now() + (result.expire ?? 7200) * 1000 };
    return result.app_access_token;
  }

  async request<T>(path: string, init: RequestInit = {}, userAccessToken?: string): Promise<T> {
    const token = userAccessToken ?? await this.getTenantAccessToken();
    const response = await fetch(`https://open.feishu.cn/open-apis${path}`, {
      ...init, headers: { 'content-type': 'application/json; charset=utf-8', authorization: `Bearer ${token}`, ...init.headers },
    });
    const result = await response.json() as FeishuEnvelope<T>;
    if (!response.ok || result.code !== 0) throw new AppError(502, 'FEISHU_API_ERROR', `飞书接口调用失败：${result.msg ?? result.message ?? response.status}`);
    return result.data as T;
  }

  async listRecords(appToken: string, tableId: string) {
    const records: Array<{ record_id: string; fields: Record<string, unknown> }> = [];
    let pageToken = '';
    do {
      const query = new URLSearchParams({ page_size: '500' });
      if (pageToken) query.set('page_token', pageToken);
      const data = await this.request<{ items?: typeof records; has_more?: boolean; page_token?: string }>(`/bitable/v1/apps/${appToken}/tables/${tableId}/records?${query}`);
      records.push(...(data.items ?? [])); pageToken = data.has_more ? (data.page_token ?? '') : '';
    } while (pageToken);
    return records;
  }

  async createRecord(appToken: string, tableId: string, fields: Record<string, unknown>) {
    return this.request<{ record: { record_id: string; fields: Record<string, unknown> } }>(`/bitable/v1/apps/${appToken}/tables/${tableId}/records`, { method: 'POST', body: JSON.stringify({ fields }) });
  }

  async updateRecord(appToken: string, tableId: string, recordId: string, fields: Record<string, unknown>) {
    return this.request(`/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`, { method: 'PUT', body: JSON.stringify({ fields }) });
  }

  async exchangeLoginCode(code: string) {
    const token = await this.getAppAccessToken();
    const tokenData = await this.request<{ access_token: string }>('/authen/v1/access_token', {
      method: 'POST', body: JSON.stringify({ grant_type: 'authorization_code', code }),
    }, token);
    return this.request<{ name: string; avatar_url?: string; open_id: string; user_id?: string }>('/authen/v1/user_info', {}, tokenData.access_token);
  }
}
