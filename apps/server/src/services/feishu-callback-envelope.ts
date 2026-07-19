import { createDecipheriv, createHash, timingSafeEqual } from 'node:crypto';

export type FeishuCallbackObject = Record<string, unknown>;

export function asFeishuCallbackObject(value: unknown): FeishuCallbackObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as FeishuCallbackObject
    : {};
}

export function decryptFeishuEnvelope(encrypted: string, encryptKey: string): FeishuCallbackObject {
  const payload = Buffer.from(encrypted, 'base64');
  if (payload.length <= 16) throw new Error('encrypted payload is too short');
  const key = createHash('sha256').update(encryptKey).digest();
  const decipher = createDecipheriv('aes-256-cbc', key, payload.subarray(0, 16));
  const plaintext = Buffer.concat([
    decipher.update(payload.subarray(16)),
    decipher.final(),
  ]).toString('utf8');
  return asFeishuCallbackObject(JSON.parse(plaintext));
}

export function safeSecretEqual(actual: unknown, expected?: string) {
  if (!expected || typeof actual !== 'string') return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
