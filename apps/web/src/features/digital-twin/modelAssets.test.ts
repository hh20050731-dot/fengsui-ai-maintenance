import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { enhancedV1KeyNodeNames } from './semanticNodeMapping';

interface GlbJson {
  asset?: { version?: string };
  nodes?: Array<{ name?: string }>;
}

function readGlbJson(file: string): GlbJson {
  const data = readFileSync(file);
  expect(data.toString('ascii', 0, 4)).toBe('glTF');
  expect(data.readUInt32LE(4)).toBe(2);
  const jsonLength = data.readUInt32LE(12);
  expect(data.readUInt32LE(16)).toBe(0x4e4f534a);
  return JSON.parse(data.toString('utf8', 20, 20 + jsonLength).trim());
}

const modelPath = (name: string) => fileURLToPath(new URL(`../../../public/models/${name}`, import.meta.url));

describe('网站GLB静态资源', () => {
  it('原始模型与增强模型作为两个独立文件存在', () => {
    const original = modelPath('induced-draft-fan.glb');
    const enhanced = modelPath('induced-draft-fan-enhanced-v1.glb');
    expect(existsSync(original)).toBe(true);
    expect(existsSync(enhanced)).toBe(true);
    expect(original).not.toBe(enhanced);
    expect(readGlbJson(original).asset?.version).toBe('2.0');
    expect(readGlbJson(enhanced).asset?.version).toBe('2.0');
  });

  it('增强版GLB包含离线验证报告中的16个关键节点', () => {
    const enhanced = readGlbJson(modelPath('induced-draft-fan-enhanced-v1.glb'));
    const names = new Set((enhanced.nodes ?? []).map((node) => node.name));
    enhancedV1KeyNodeNames.forEach((name) => expect(names.has(name), `缺少节点 ${name}`).toBe(true));
  });
});
