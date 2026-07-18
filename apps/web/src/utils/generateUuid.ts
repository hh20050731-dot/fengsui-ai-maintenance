type BrowserCrypto = {
  randomUUID?: () => string;
  getRandomValues?: (bytes: Uint8Array) => Uint8Array;
};

let fallbackSequence = 0;

/** 兼容旧版飞书 WebView 与非安全上下文，仅用于前端记录标识和请求幂等键。 */
export function generateUuid(cryptoOverride?: BrowserCrypto): string {
  const cryptoApi = cryptoOverride ?? (typeof globalThis.crypto === 'undefined' ? undefined : globalThis.crypto as BrowserCrypto);

  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();

  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
    return [
      hex.slice(0, 4).join(''),
      hex.slice(4, 6).join(''),
      hex.slice(6, 8).join(''),
      hex.slice(8, 10).join(''),
      hex.slice(10, 16).join(''),
    ].join('-');
  }

  fallbackSequence += 1;
  return `fallback-${Date.now()}-${fallbackSequence}-${Math.random().toString(16).slice(2)}`;
}
