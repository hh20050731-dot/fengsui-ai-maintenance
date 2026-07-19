import { describe, expect, it } from 'vitest';
import { normalizeFeishuMessageText } from './feishu-message-text.js';

describe('飞书消息文本标准化', () => {
  it('解析JSON content并移除群聊mention', () => {
    expect(normalizeFeishuMessageText(
      JSON.stringify({ text: '@_user_1 查询1号引风机状态' }),
      [{ key: '@_user_1', name: '烽燧智守' }],
    )).toBe('查询1号引风机状态');
  });

  it('移除可见机器人名并统一中文设备编号', () => {
    expect(normalizeFeishuMessageText('@烽燧智守   查看  一号引风机状态？')).toBe('查看 1号引风机状态?');
  });

  it('统一全角数字、标点与IDF设备编号', () => {
    expect(normalizeFeishuMessageText(JSON.stringify({ text: '  IDF－００１，状态。 ' })))
      .toBe('1号引风机,状态.');
  });
});
