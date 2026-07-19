import { describe, expect, it, vi } from 'vitest';
import { createMockData } from '@fengsui/shared';
import { DoubaoProvider, ResilientAiProvider, RuleBasedFallbackProvider } from './structured-ai-provider.js';

const data = createMockData();
const input = { device: data.equipment.find((item) => item.deviceId === 'IDF-001')!, telemetry: data.telemetry['IDF-001']!, citations: [], question: '为什么存在轴承温升风险' };

describe('结构化AI Provider', () => {
  it('缺少豆包凭证时使用规则Provider', async () => {
    const provider = new ResilientAiProvider(new DoubaoProvider({ baseUrl: 'https://example.invalid' }), new RuleBasedFallbackProvider());
    const result = await provider.diagnose(input);
    expect(result.provider).toBe('RuleBasedFallbackProvider');
    expect(result.limitations.length).toBeGreaterThan(0);
  });

  it('豆包返回无效JSON时重试一次后安全降级', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'not-json' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const provider = new ResilientAiProvider(new DoubaoProvider({ apiKey: 'test-only-key', model: 'test-endpoint', baseUrl: 'https://example.invalid', fetchImpl: fetchImpl as typeof fetch }), new RuleBasedFallbackProvider());
    const result = await provider.diagnose(input);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.provider).toBe('RuleBasedFallbackProvider');
  });

  it('趋势方向正确显示下降', async () => {
    const fallback = new RuleBasedFallbackProvider();
    const result = await fallback.diagnose({ ...input, telemetry: [{ ...input.telemetry[0]!, vibration: 4.2, temperature: 72 }, { ...input.telemetry[1]!, vibration: 3.1, temperature: 68 }] });
    expect(result.evidence.join(' ')).toContain('下降1.1 mm/s');
    expect(result.evidence.join(' ')).toContain('下降4℃');
  });
});
