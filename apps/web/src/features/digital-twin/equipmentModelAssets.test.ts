import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { equipmentModelLibrary } from './equipmentModels';

const root = path.resolve(process.cwd(), 'apps/web/public/models');

function readGlb(fileName: string) {
  const buffer = fs.readFileSync(path.join(root, fileName));
  expect(buffer.toString('ascii', 0, 4)).toBe('glTF');
  const jsonLength = buffer.readUInt32LE(12);
  const jsonType = buffer.toString('ascii', 16, 20);
  expect(jsonType).toBe('JSON');
  return { size: buffer.length, json: JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength).replace(/\0+$/g, '').trim()) as any };
}

function triangleCount(json: any) {
  return (json.meshes ?? []).reduce((total: number, mesh: any) => total + (mesh.primitives ?? []).reduce((sum: number, primitive: any) => {
    const accessorIndex = primitive.indices ?? primitive.attributes?.POSITION;
    const count = json.accessors?.[accessorIndex]?.count ?? 0;
    return sum + Math.floor(count / 3);
  }, 0), 0);
}

describe('generated GLB model assets', () => {
  it('parses every LOD and preserves declared semantic node names', () => {
    for (const model of equipmentModelLibrary) {
      for (const url of Object.values(model.lods)) {
        const { size, json } = readGlb(path.basename(url));
        expect(size).toBeGreaterThan(20_000);
        expect(triangleCount(json)).toBeGreaterThan(100);
        const names = new Set((json.nodes ?? []).map((node: any) => node.name));
        for (const node of model.semanticNodes) expect(names.has(node), `${model.id} missing ${node}`).toBe(true);
      }
    }
  });

  it('keeps induced-draft fan LODs inside required triangle ranges', () => {
    const expected: Record<string, [number, number]> = { lod0: [80_000, 150_000], lod1: [20_000, 40_000], lod2: [5_000, 10_000] };
    const fan = equipmentModelLibrary.find((item) => item.id === 'induced-draft-fan')!;
    for (const [lod, url] of Object.entries(fan.lods)) {
      const count = triangleCount(readGlb(path.basename(url)).json);
      expect(count).toBeGreaterThanOrEqual(expected[lod]![0]);
      expect(count).toBeLessThanOrEqual(expected[lod]![1]);
    }
  });
});
