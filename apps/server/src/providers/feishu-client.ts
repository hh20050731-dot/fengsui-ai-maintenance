import { env } from '../config/env.js';
import { AppError } from '../middleware/errors.js';

interface FeishuEnvelope<T> { code: number; msg?: string; message?: string; data?: T; tenant_access_token?: string; app_access_token?: string; expire?: number }
export interface FeishuBitableRecord { record_id: string; fields: Record<string, unknown> }
export interface FeishuContactIdentity { openId: string; userId?: string; name?: string; email?: string; mobile?: string }

export class FeishuClient {
  private tenantToken?: { value: string; expiresAt: number };
  private appToken?: { value: string; expiresAt: number };

  async getTenantAccessToken(): Promise<string> {
    if (this.tenantToken && this.tenantToken.expiresAt > Date.now() + 60_000) return this.tenantToken.value;
    let response: Response;
    try {
      response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ app_id: env.FEISHU_APP_ID, app_secret: env.FEISHU_APP_SECRET }),
      });
    } catch {
      throw new AppError(503, 'FEISHU_AUTH_UNAVAILABLE', '飞书鉴权服务暂不可用');
    }
    const result = await response.json() as FeishuEnvelope<never>;
    if (!response.ok) throw new AppError(503, 'FEISHU_AUTH_UNAVAILABLE', '飞书鉴权服务暂不可用');
    if (result.code !== 0 || !result.tenant_access_token) throw new AppError(502, 'FEISHU_AUTH_INVALID', '飞书应用凭证无效');
    this.tenantToken = { value: result.tenant_access_token, expiresAt: Date.now() + (result.expire ?? 7200) * 1000 };
    return result.tenant_access_token;
  }

  async getAppAccessToken(): Promise<string> {
    if (this.appToken && this.appToken.expiresAt > Date.now() + 60_000) return this.appToken.value;
    let response: Response;
    try {
      response = await fetch('https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ app_id: env.FEISHU_APP_ID, app_secret: env.FEISHU_APP_SECRET }),
      });
    } catch {
      throw new AppError(503, 'FEISHU_AUTH_UNAVAILABLE', '飞书鉴权服务暂不可用');
    }
    const result = await response.json() as FeishuEnvelope<never>;
    if (!response.ok) throw new AppError(503, 'FEISHU_AUTH_UNAVAILABLE', '飞书鉴权服务暂不可用');
    if (result.code !== 0 || !result.app_access_token) throw new AppError(502, 'FEISHU_AUTH_INVALID', '飞书应用凭证无效');
    this.appToken = { value: result.app_access_token, expiresAt: Date.now() + (result.expire ?? 7200) * 1000 };
    return result.app_access_token;
  }

  async request<T>(path: string, init: RequestInit = {}, userAccessToken?: string): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const token = userAccessToken ?? await this.getTenantAccessToken();
      const response = await fetch(`https://open.feishu.cn/open-apis${path}`, {
        ...init, headers: { 'content-type': 'application/json; charset=utf-8', authorization: `Bearer ${token}`, ...init.headers },
      });
      const result = await response.json() as FeishuEnvelope<T>;
      const tenantTokenInvalid = !userAccessToken && (response.status === 401 || result.code === 99991663);
      if (tenantTokenInvalid && attempt === 0) {
        this.tenantToken = undefined;
        continue;
      }
      if (!response.ok || result.code !== 0) throw new AppError(502, 'FEISHU_API_ERROR', `飞书接口调用失败（${result.code ?? response.status}）：${result.msg ?? result.message ?? response.status}`);
      return result.data as T;
    }
    throw new AppError(502, 'FEISHU_TOKEN_RETRY_EXHAUSTED', '飞书应用凭证刷新后仍无法完成接口调用');
  }

  async listRecords(appToken: string, tableId: string) {
    const records: FeishuBitableRecord[] = [];
    let pageToken = '';
    do {
      const query = new URLSearchParams({ page_size: '500' });
      if (pageToken) query.set('page_token', pageToken);
      const data = await this.request<{ items?: typeof records; has_more?: boolean; page_token?: string }>(`/bitable/v1/apps/${appToken}/tables/${tableId}/records?${query}`);
      records.push(...(data.items ?? [])); pageToken = data.has_more ? (data.page_token ?? '') : '';
    } while (pageToken);
    return records;
  }

  async searchRecords(appToken: string, tableId: string, fieldName: string, exactValue: string) {
    const data = await this.request<{ items?: FeishuBitableRecord[] }>(
      `/bitable/v1/apps/${appToken}/tables/${tableId}/records/search?page_size=100`,
      { method: 'POST', body: JSON.stringify({ filter: { conjunction: 'and', conditions: [{ field_name: fieldName, operator: 'is', value: [exactValue] }] } }) },
    );
    return data.items ?? [];
  }

  async createRecord(appToken: string, tableId: string, fields: Record<string, unknown>) {
    return this.request<{ record: FeishuBitableRecord }>(`/bitable/v1/apps/${appToken}/tables/${tableId}/records`, { method: 'POST', body: JSON.stringify({ fields }) });
  }

  async updateRecord(appToken: string, tableId: string, recordId: string, fields: Record<string, unknown>) {
    return this.request<{ record?: FeishuBitableRecord }>(`/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`, { method: 'PUT', body: JSON.stringify({ fields }) });
  }

  async getRecord(appToken: string, tableId: string, recordId: string) {
    return this.request<{ record: FeishuBitableRecord }>(`/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`);
  }

  async findUsersByEmails(emails: string[]) {
    return this.findContactIds({ emails });
  }

  async findUsersByMobiles(mobiles: string[]) {
    return this.findContactIds({ mobiles });
  }

  private async findContactIds(input: { emails?: string[]; mobiles?: string[] }) {
    const data = await this.request<{ user_list?: Array<{ user_id?: string; email?: string; mobile?: string; status?: { is_activated?: boolean } }> }>(
      '/contact/v3/users/batch_get_id?user_id_type=open_id',
      { method: 'POST', body: JSON.stringify(input) },
    );
    return (data.user_list ?? []).filter((item) => item.user_id).map((item) => ({
      openId: item.user_id as string, email: item.email, mobile: item.mobile,
    } satisfies FeishuContactIdentity));
  }

  async getUserByOpenId(openId: string) {
    const data = await this.request<{ user: { open_id: string; user_id?: string; name?: string; email?: string; mobile?: string } }>(
      `/contact/v3/users/${encodeURIComponent(openId)}?user_id_type=open_id`,
    );
    return {
      openId: data.user.open_id, userId: data.user.user_id, name: data.user.name,
      email: data.user.email, mobile: data.user.mobile,
    } satisfies FeishuContactIdentity;
  }

  async exchangeLoginCode(code: string) {
    const token = await this.getAppAccessToken();
    const tokenData = await this.request<{ access_token: string }>('/authen/v1/access_token', {
      method: 'POST', body: JSON.stringify({ grant_type: 'authorization_code', code }),
    }, token);
    return this.request<{ name: string; avatar_url?: string; open_id: string; user_id?: string }>('/authen/v1/user_info', {}, tokenData.access_token);
  }
}
