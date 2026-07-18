import { describe, expect, it } from 'vitest';
import { generateUuid } from './generateUuid';

describe('generateUuid', () => {
  it('优先使用浏览器提供的 randomUUID', () => {
    expect(generateUuid({ randomUUID: () => '123e4567-e89b-42d3-a456-426614174000' })).toBe('123e4567-e89b-42d3-a456-426614174000');
  });

  it('只有 getRandomValues 时生成符合 UUID v4 格式的值', () => {
    let seed = 0;
    const cryptoApi = {
      getRandomValues(bytes: Uint8Array) {
        bytes.forEach((_, index) => { bytes[index] = (index + seed) & 0xff; });
        seed += 1;
        return bytes;
      },
    };
    const first = generateUuid(cryptoApi);
    const second = generateUuid(cryptoApi);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(second).not.toBe(first);
  });

  it('两种加密能力均不存在时生成非空且不重复的降级ID', () => {
    const first = generateUuid({});
    const second = generateUuid({});
    expect(first).toMatch(/^fallback-\d+-\d+-[0-9a-f]+$/);
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
  });
});
