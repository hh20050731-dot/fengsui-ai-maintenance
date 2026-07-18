import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { findModelPartNodes } from './modelPartMapping';
import {
  enhancedV1KeyNodeNames,
  scenarioSemanticTargets,
  semanticDisplayName,
  validateEnhancedV1Nodes,
} from './semanticNodeMapping';

function buildSemanticModel() {
  const root = new Group();
  root.name = 'Scene';
  const semanticRoot = new Group();
  semanticRoot.name = 'Fan_Digital_Twin';
  root.add(semanticRoot);

  enhancedV1KeyNodeNames.slice(1).forEach((name) => {
    const node = name.endsWith('_group') ? new Group() : new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    node.name = name;
    semanticRoot.add(node);
  });
  return root;
}

describe('增强模型语义节点映射', () => {
  it('验证报告中的16个关键节点可以全部通过精确名称找到', () => {
    const root = buildSemanticModel();
    const validation = validateEnhancedV1Nodes(root);
    expect(validation.complete).toBe(true);
    expect(validation.found).toHaveLength(16);
    expect(validation.missing).toEqual([]);
  });

  it('缺失节点时返回安全降级信息而不是抛错', () => {
    const root = buildSemanticModel();
    root.getObjectByName('coupling_guard')?.removeFromParent();
    const validation = validateEnhancedV1Nodes(root);
    expect(validation.complete).toBe(false);
    expect(validation.missing).toEqual(['coupling_guard']);
    expect(findModelPartNodes(root, 'coupling', 'enhanced-v1')).toHaveLength(5);
  });

  it('点击语义节点优先显示GLB内保留的中文名称', () => {
    const root = buildSemanticModel();
    const locator = root.getObjectByName('bearing_drive_locator')!;
    locator.userData.display_name_zh = '驱动端轴承';
    expect(semanticDisplayName(locator)).toBe('驱动端轴承');
  });

  it('四种场景使用集中且可追溯的语义目标', () => {
    expect(scenarioSemanticTargets.normal).toEqual([]);
    expect(scenarioSemanticTargets['impeller-imbalance']).toEqual(['impeller']);
    expect(scenarioSemanticTargets['bearing-overheat']).toEqual(['bearingDriveLocator']);
    expect(scenarioSemanticTargets['coupling-misalignment']).toEqual(['coupling', 'shaft']);
  });

  it('切换模型根节点不会复用旧模型节点引用', () => {
    const first = buildSemanticModel();
    const second = buildSemanticModel();
    const firstNode = first.getObjectByName('main_shaft');
    const secondNode = second.getObjectByName('main_shaft');
    expect(firstNode).toBeDefined();
    expect(secondNode).toBeDefined();
    expect(secondNode).not.toBe(firstNode);
  });
});
