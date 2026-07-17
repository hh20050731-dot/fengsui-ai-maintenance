import type { User } from '@fengsui/shared';
import { FeishuClient } from './feishu-client.js';

export interface AuthProvider { login(code?: string): Promise<User> }
export class DemoAuthProvider implements AuthProvider {
  async login(): Promise<User> { return { id: 'demo-user', name: '黄浩', role: '项目演示员', source: 'demo' }; }
}
export class FeishuAuthProvider implements AuthProvider {
  private client = new FeishuClient();
  async login(code?: string): Promise<User> {
    if (!code) throw new Error('缺少飞书临时授权码');
    const user = await this.client.exchangeLoginCode(code);
    return { id: user.user_id ?? user.open_id, name: user.name, role: '运维人员', avatar: user.avatar_url, source: 'feishu' };
  }
}
