import { AppError } from '../middleware/errors.js';
import type { FeishuClient, FeishuContactIdentity } from '../providers/feishu-client.js';

export interface FeishuContactQuery {
  openId?: string;
  email?: string;
  mobile?: string;
}

type ContactClient = Pick<FeishuClient, 'getUserByOpenId' | 'findUsersByEmails' | 'findUsersByMobiles'>;

/**
 * 统一通讯录解析：优先使用可信 open_id，其次邮箱、手机号。
 * 找不到联系人时返回安全错误码，绝不把邮箱、手机号或 open_id 写入错误消息。
 */
export class FeishuContactResolver {
  constructor(private readonly client: ContactClient) {}

  async resolve(query: FeishuContactQuery): Promise<FeishuContactIdentity> {
    try {
      if (query.openId) return await this.client.getUserByOpenId(query.openId);
      if (query.email) {
        const [user] = await this.client.findUsersByEmails([query.email]);
        if (user) return user;
      }
      if (query.mobile) {
        const [user] = await this.client.findUsersByMobiles([query.mobile]);
        if (user) return user;
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(502, 'FEISHU_CONTACT_LOOKUP_FAILED', '飞书通讯录查询失败，请检查权限后重试');
    }
    throw new AppError(404, 'FEISHU_CONTACT_NOT_FOUND', '未找到匹配的飞书联系人');
  }

  async resolveAssigneeOpenId(query: FeishuContactQuery) {
    return (await this.resolve(query)).openId;
  }
}
