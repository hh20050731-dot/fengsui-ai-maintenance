import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { industrialTheme } from './industrialTheme';

describe('深色工业主题防回退', () => {
  it('保留统一深色设计变量和工业字体', () => {
    const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
    expect(css).toContain('--industrial-bg: #07131f');
    expect(css).toContain('--industrial-surface: #0d2033');
    expect(css).toContain('--industrial-font-sans: "Noto Sans SC"');
    expect(css).toContain('--industrial-font-mono: "JetBrains Mono"');
    expect(css).toContain('color-scheme: dark');
  });

  it('风险色只使用统一主题令牌', () => {
    expect(industrialTheme.colors.background).toBe('#07131f');
    expect(industrialTheme.colors.success).toBe('#44d8ad');
    expect(industrialTheme.colors.warning).toBe('#f0a84c');
    expect(industrialTheme.colors.danger).toBe('#e0525d');
  });
});
