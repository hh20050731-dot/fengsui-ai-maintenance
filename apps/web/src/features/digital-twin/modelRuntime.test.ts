import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial } from 'three';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyCasingDisplayMode,
  applyCouplingGuardVisibility,
  captureModelState,
  restoreModelState,
} from './modelRuntime';

function buildRuntimeModel() {
  const root = new Group();
  const casing = new Group();
  casing.name = 'casing_group';
  const casingMaterial = new MeshStandardMaterial({ color: new Color('#31506b') });
  const casingMesh = new Mesh(new BoxGeometry(), casingMaterial);
  casing.add(casingMesh);
  const guard = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  guard.name = 'coupling_guard';
  root.add(casing, guard);
  return { root, casing, casingMaterial, guard };
}

describe('增强模型运行时状态', () => {
  it('机壳支持正常、半透明和隐藏，并可完整恢复', () => {
    const { root, casing, casingMaterial } = buildRuntimeModel();
    const state = captureModelState(root);
    expect(applyCasingDisplayMode(root, 'transparent')).toBe(true);
    expect(casingMaterial.opacity).toBe(0.18);
    expect(casingMaterial.depthWrite).toBe(false);
    casingMaterial.color.set('#ff0000');
    applyCasingDisplayMode(root, 'hidden');
    expect(casing.visible).toBe(false);
    restoreModelState(state);
    expect(casing.visible).toBe(true);
    expect(casingMaterial.opacity).toBe(1);
    expect(casingMaterial.transparent).toBe(false);
    expect(casingMaterial.depthWrite).toBe(true);
    expect(casingMaterial.color.getHexString()).toBe('31506b');
  });

  it('联轴器防护罩可以独立隐藏并恢复', () => {
    const { root, guard } = buildRuntimeModel();
    const state = captureModelState(root);
    expect(applyCouplingGuardVisibility(root, false)).toBe(true);
    expect(guard.visible).toBe(false);
    restoreModelState(state);
    expect(guard.visible).toBe(true);
  });

  it('缺失语义节点时控制函数不会破坏模型', () => {
    const root = new Group();
    expect(applyCasingDisplayMode(root, 'hidden')).toBe(false);
    expect(applyCouplingGuardVisibility(root, false)).toBe(false);
  });

  it('场景动画不再读取已弃用的THREE.Clock', () => {
    const source = readFileSync('apps/web/src/features/digital-twin/components/ModelScene.tsx', 'utf8');
    expect(source).not.toMatch(/new\s+(?:THREE\.)?Clock|getElapsedTime\s*\(|\{\s*clock\s*\}/);
    expect(source).toContain('elapsedSeconds.current += Math.min(delta, 0.1)');
  });
});
