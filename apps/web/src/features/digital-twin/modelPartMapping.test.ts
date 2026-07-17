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
});
