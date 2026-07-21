import { describe, expect, it, vi } from 'vitest';
import { FeishuContactResolver } from './feishu-contact-resolver.js';

describe('飞书通讯录解析', () => {
  it('优先使用openId，不再查询邮箱或手机号', async () => {
    const client = { getUserByOpenId: vi.fn().mockResolvedValue({ openId: 'ou_safe' }), findUsersByEmails: vi.fn(), findUsersByMobiles: vi.fn() };
    const resolver = new FeishuContactResolver(client as never);
    await expect(resolver.resolve({ openId: 'ou_safe', email: 'demo@example.com' })).resolves.toMatchObject({ openId: 'ou_safe' });
    await expect(resolver.resolveAssigneeOpenId({ openId: 'ou_safe' })).resolves.toBe('ou_safe');
    expect(client.findUsersByEmails).not.toHaveBeenCalled();
  });

  it('邮箱无结果后可按手机号解析，错误不回显原始标识', async () => {
    const client = { getUserByOpenId: vi.fn(), findUsersByEmails: vi.fn().mockResolvedValue([]), findUsersByMobiles: vi.fn().mockResolvedValue([{ openId: 'ou_mobile' }]) };
    await expect(new FeishuContactResolver(client as never).resolve({ email: 'demo@example.com', mobile: '13800000000' })).resolves.toMatchObject({ openId: 'ou_mobile' });
    await expect(new FeishuContactResolver({ ...client, findUsersByMobiles: vi.fn().mockResolvedValue([]) } as never).resolve({ mobile: '13800000000' })).rejects.not.toThrow('13800000000');
  });
});
