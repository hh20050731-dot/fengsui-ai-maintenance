import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { equipmentModelLibrary, resolveEquipmentModel, resolveModelLod } from './equipmentModels';

const publicModels = path.resolve(process.cwd(), 'apps/web/public/models');

describe('equipment model library', () => {
  it('registers nine semantic model families with three local LOD assets', () => {
    expect(equipmentModelLibrary).toHaveLength(9);
    for (const model of equipmentModelLibrary) {
      expect(model.dataBoundary).toContain('不是厂家精确CAD');
      expect(model.semanticNodes.length).toBeGreaterThan(3);
      for (const url of Object.values(model.lods)) {
        const file = path.basename(url);
        expect(fs.existsSync(path.join(publicModels, file)), `${model.id}: ${file}`).toBe(true);
      }
    }
  });

  it('maps all competition devices to a model and applies safe LOD defaults', () => {
    for (const id of ['IDF-001', 'IDF-002', 'FWP-001', 'FWP-002', 'CWP-001', 'CWP-002', 'GRB-001', 'ACP-001', 'LCP-001', 'PAF-001', 'SAF-001', 'CLP-001']) {
      expect(resolveEquipmentModel(id).supportedDeviceIds).toContain(id);
    }
    expect(resolveModelLod(null)).toBe('lod0');
    expect(resolveModelLod('lod1')).toBe('lod1');
    expect(resolveModelLod('unknown')).toBe('lod0');
  });
});
