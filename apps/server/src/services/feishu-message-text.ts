import { normalizeDiagnosisQuestion } from '@fengsui/shared';

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function extractText(content: unknown) {
  if (typeof content !== 'string') {
    const value = asObject(content).text;
    return typeof value === 'string' ? value : undefined;
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    if (typeof parsed === 'string') return parsed;
    const value = asObject(parsed).text;
    return typeof value === 'string' ? value : undefined;
  } catch {
    // 兼容测试工具或后续 SDK 直接传入的纯文本。
    return content;
  }
}

/** 只返回用于意图识别的纯文本，不在日志中输出用户消息。 */
export function normalizeFeishuMessageText(content: unknown, rawMentions?: unknown) {
  let text = extractText(content);
  if (!text) return undefined;

  const mentions = Array.isArray(rawMentions) ? rawMentions : [];
  for (const rawMention of mentions) {
    const mention = asObject(rawMention);
    if (typeof mention.key === 'string' && mention.key) {
      text = text.replaceAll(mention.key, ' ');
    }
    if (typeof mention.name === 'string' && mention.name) {
      text = text.replaceAll(`@${mention.name}`, ' ');
    }
  }

  text = text
    .normalize('NFKC')
    .replace(/<at\b[^>]*>.*?<\/at>/gi, ' ')
    .replace(/@_user_\d+/gi, ' ')
    .replace(/@烽燧智守/gi, ' ');

  const normalized = normalizeDiagnosisQuestion(text);
  return normalized || undefined;
}
