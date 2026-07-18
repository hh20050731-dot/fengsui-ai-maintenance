import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { countSemanticParts, findModelPartNodes } from './modelPartMapping';

describe('GLB部件映射', () => {
  it('集中式关键词可以识别语义化部件节点', () => {
    const root = new Group();
    const bearing = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    bearing.name = 'Drive_End_Bearing';
    root.add(bearing);
    expect(findModelPartNodes(root, 'bearing')).toEqual([bearing]);
    expect(countSemanticParts(root)).toBe(1);
  });

  it('不伪造未命名的故障部件', () => {
    const root = new Group();
    const shell = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    shell.name = 'SHELL003';
    root.add(shell);
    expect(findModelPartNodes(root, 'bearing')).toEqual([]);
    expect(findModelPartNodes(root, 'coupling')).toEqual([]);
  });

  it('增强模型只按精确语义节点定位故障部件', () => {
    const root = new Group();
    const impellerGroup = new Group();
    impellerGroup.name = 'impeller_group';
    const impeller = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    impeller.name = 'SHELL001';
    impellerGroup.add(impeller);
    const misleading = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    misleading.name = 'bearing_like_but_not_mapped';
    root.add(impellerGroup, misleading);

    expect(findModelPartNodes(root, 'impeller', 'enhanced-v1')).toEqual([impeller]);
    expect(findModelPartNodes(root, 'bearing', 'enhanced-v1')).toEqual([]);
  });
});
