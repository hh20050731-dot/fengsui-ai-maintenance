import { describe, expect, it } from 'vitest';
import {
  defaultFanModelVersion,
  fanModelVariants,
  modelVersionSwitcherEnabled,
  resolveFanModelVersion,
} from './modelVariants';

describe('数字孪生模型版本配置', () => {
  it('无model参数时默认加载增强模型 v1', () => {
    expect(defaultFanModelVersion).toBe('enhanced-v1');
    expect(resolveFanModelVersion(null)).toBe('enhanced-v1');
    expect(resolveFanModelVersion('')).toBe('enhanced-v1');
    expect(fanModelVariants['enhanced-v1'].url).toContain('/models/induced-draft-fan-enhanced-v1.glb');
  });

  it('URL参数可显式覆盖默认模型', () => {
    expect(resolveFanModelVersion('enhanced-v1')).toBe('enhanced-v1');
    expect(resolveFanModelVersion('original')).toBe('original');
    expect(resolveFanModelVersion('unknown')).toBe('enhanced-v1');
    expect(modelVersionSwitcherEnabled).toBe(true);
    expect(fanModelVariants.original.url).toContain('/models/induced-draft-fan.glb');
  });

  it('增强版使用独立静态资源且不覆盖原模型', () => {
    expect(fanModelVariants['enhanced-v1'].fileName).toBe('induced-draft-fan-enhanced-v1.glb');
    expect(fanModelVariants['enhanced-v1'].url).not.toBe(fanModelVariants.original.url);
  });
});
