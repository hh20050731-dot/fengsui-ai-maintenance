import { Html, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Box3, Color, Material, Mesh, Object3D, Vector3 } from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { countSemanticParts, findModelPartNodes } from '../modelPartMapping';
import {
  applyCasingDisplayMode,
  applyCouplingGuardVisibility,
  captureModelState,
  disposeClonedModel,
  materialList,
  restoreModelState,
} from '../modelRuntime';
import {
  enhancedV1KeyNodeNames,
  findSemanticNodes,
  semanticDisplayName,
  validateEnhancedV1Nodes,
} from '../semanticNodeMapping';
import type { FanModelVersion } from '../modelVariants';
import type {
  CasingDisplayMode,
  FaultScenario,
  ModelInspection,
  ModelNodeInfo,
  PartResolution,
} from '../digitalTwinTypes';
import { digitalTwinTheme } from '../digitalTwinTheme';

const MODEL_FLOOR_Y = -2.38;

function inspectNode(node: Object3D, modelVersion: FanModelVersion): ModelNodeInfo {
  const mesh = node as Mesh;
  const materials = mesh.isMesh ? materialList(mesh.material) : [];
  return {
    uuid: node.uuid,
    name: node.name || `未命名-${node.type}`,
    displayName: modelVersion === 'enhanced-v1' ? semanticDisplayName(node) : (node.name || `未命名-${node.type}`),
    type: node.type,
    isMesh: Boolean(mesh.isMesh),
    parentName: node.parent?.name || 'Scene',
    vertexCount: mesh.isMesh ? mesh.geometry.getAttribute('position')?.count : undefined,
    materialNames: materials.map((item) => item.name || item.type),
  };
}

function setMaterialHighlight(material: Material, colorValue: string, intensity: number, opacity?: number) {
  const target = new Color(colorValue);
  const enhanced = material as Material & { color?: Color; emissive?: Color; emissiveIntensity?: number };
  enhanced.color?.lerp(target, 0.52);
  if (enhanced.emissive) {
    enhanced.emissive.copy(target).multiplyScalar(0.18);
    enhanced.emissiveIntensity = intensity;
  }
  if (opacity !== undefined) {
    material.transparent = opacity < 1;
    material.opacity = opacity;
    material.depthWrite = opacity >= 0.95;
  }
  material.needsUpdate = true;
}

function applyLegacyCasingMode(root: Object3D, mode: CasingDisplayMode) {
  const casingMeshes = findModelPartNodes(root, 'casing', 'original') as Mesh[];
  casingMeshes.forEach((mesh) => {
    mesh.visible = mode !== 'hidden';
    if (mode === 'transparent') {
      materialList(mesh.material).forEach((item) => {
        item.transparent = true;
        item.opacity = 0.18;
        item.depthWrite = false;
        item.needsUpdate = true;
      });
    }
  });
}

export function ModelScene({
  modelUrl,
  modelVersion,
  scenario,
  casingDisplayMode,
  couplingGuardVisible,
  selectedNodeUuid,
  loadStartedAt,
  onSelectNode,
  onInspection,
  onFit,
  onPartResolution,
}: {
  modelUrl: string;
  modelVersion: FanModelVersion;
  scenario: FaultScenario;
  casingDisplayMode: CasingDisplayMode;
  couplingGuardVisible: boolean;
  selectedNodeUuid: string | null;
  loadStartedAt: number;
  onSelectNode: (node: ModelNodeInfo | null) => void;
  onInspection: (inspection: ModelInspection) => void;
  onFit: (radius: number) => void;
  onPartResolution: (resolution: PartResolution) => void;
}) {
  const gltf = useGLTF(modelUrl);
  const activeFaultMaterials = useRef<Material[]>([]);
  const loggedModelUrl = useRef<string | null>(null);
  const prepared = useMemo(() => {
    const root = clone(gltf.scene);
    const meshes: Mesh[] = [];
    root.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      meshes.push(mesh);
      mesh.geometry = mesh.geometry.clone();
      const clonedMaterials = materialList(mesh.material).map((item) => item.clone());
      mesh.material = Array.isArray(mesh.material) ? clonedMaterials : clonedMaterials[0]!;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    root.updateMatrixWorld(true);
    const state = captureModelState(root);
    const sceneBounds = new Box3().setFromObject(root);
    const center = sceneBounds.getCenter(new Vector3());
    const size = sceneBounds.getSize(new Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z, 0.001);
    const scale = 4.8 / maxDimension;
    const position = new Vector3(
      -center.x * scale,
      MODEL_FLOOR_Y - sceneBounds.min.y * scale,
      -center.z * scale,
    );
    const radius = Math.max(size.length() * scale * 0.5, 1);
    const validation = modelVersion === 'enhanced-v1'
      ? validateEnhancedV1Nodes(root)
      : { found: [], missing: [], complete: true };
    const objectSnapshots = new Map(state.objects.map((snapshot) => [snapshot.object.uuid, snapshot]));
    return {
      root,
      meshes,
      state,
      scale,
      position,
      radius,
      validation,
      objectSnapshots,
      impeller: modelVersion === 'enhanced-v1' ? findSemanticNodes(root, 'impeller')[0] : undefined,
      couplingNodes: modelVersion === 'enhanced-v1'
        ? [...findSemanticNodes(root, 'coupling'), ...findSemanticNodes(root, 'shaft')]
        : [],
    };
  }, [gltf.scene, modelVersion]);

  const restoreAll = useCallback(() => {
    restoreModelState(prepared.state);
    activeFaultMaterials.current = [];
  }, [prepared.state]);

  useEffect(() => {
    onFit(prepared.radius);
    let nodeCount = 0;
    let namedMeshCount = 0;
    prepared.root.traverse((node) => {
      nodeCount += 1;
      if ((node as Mesh).isMesh && node.name) namedMeshCount += 1;
    });
    onInspection({
      nodeCount,
      meshCount: prepared.meshes.length,
      namedMeshCount,
      semanticPartCount: countSemanticParts(prepared.root, modelVersion),
      keyNodeCount: prepared.validation.found.length,
      requiredKeyNodeCount: modelVersion === 'enhanced-v1' ? enhancedV1KeyNodeNames.length : 0,
      missingKeyNodes: prepared.validation.missing,
      loadTimeMs: Math.max(0, performance.now() - loadStartedAt),
    });
    if (import.meta.env.DEV && loggedModelUrl.current !== modelUrl) {
      loggedModelUrl.current = modelUrl;
      console.groupCollapsed(`[数字孪生] 模型节点验证 · ${modelVersion}`);
      if (modelVersion === 'enhanced-v1') {
        console.info('关键节点', prepared.validation);
        if (!prepared.validation.complete) console.warn('增强模型缺少部分关键节点，将对缺失能力安全降级。', prepared.validation.missing);
      }
      const printTree = (node: Object3D, depth = 0) => {
        const info = inspectNode(node, modelVersion);
        console.info(`${'  '.repeat(depth)}${info.name}`, { type: info.type, parent: info.parentName });
        node.children.forEach((child) => printTree(child, depth + 1));
      };
      printTree(prepared.root);
      console.groupEnd();
    }
  }, [loadStartedAt, modelUrl, modelVersion, onFit, onInspection, prepared]);

  useEffect(() => {
    restoreAll();
    if (modelVersion === 'enhanced-v1') {
      applyCasingDisplayMode(prepared.root, casingDisplayMode);
      applyCouplingGuardVisibility(prepared.root, scenario.id === 'coupling-misalignment' ? false : couplingGuardVisible);
      findSemanticNodes(prepared.root, 'bearingDriveLocator').forEach((node) => { node.visible = false; });
      findSemanticNodes(prepared.root, 'bearingNonDriveLocator').forEach((node) => { node.visible = false; });
      findSemanticNodes(prepared.root, 'rotationAxis').forEach((node) => { node.visible = false; });
    } else {
      applyLegacyCasingMode(prepared.root, casingDisplayMode);
    }

    const matchedNodes = findModelPartNodes(prepared.root, scenario.targetPart, modelVersion);
    const fallbackToWholeModel = Boolean(scenario.targetPart && matchedNodes.length === 0);
    let affectedMeshes = scenario.id === 'normal' ? [] : (fallbackToWholeModel ? prepared.meshes : matchedNodes as Mesh[]);

    if (modelVersion === 'enhanced-v1' && scenario.id === 'bearing-overheat') {
      const locator = findSemanticNodes(prepared.root, 'bearingDriveLocator');
      locator.forEach((node) => { node.visible = true; });
      affectedMeshes = locator.flatMap((node) => {
        const result: Mesh[] = [];
        node.traverse((child) => { if ((child as Mesh).isMesh) result.push(child as Mesh); });
        return result;
      });
    }
    if (modelVersion === 'enhanced-v1' && scenario.id === 'coupling-misalignment') {
      findSemanticNodes(prepared.root, 'rotationAxis').forEach((node) => { node.visible = true; });
    }

    const faultMaterials = affectedMeshes.flatMap((mesh) => materialList(mesh.material));
    faultMaterials.forEach((item) => setMaterialHighlight(
      item,
      scenario.highlightColor,
      scenario.id === 'bearing-overheat' ? 1.15 : 0.78,
      scenario.id === 'bearing-overheat' ? 0.86 : undefined,
    ));
    activeFaultMaterials.current = faultMaterials;
    if (selectedNodeUuid) {
      const selected = prepared.root.getObjectByProperty('uuid', selectedNodeUuid) as Mesh | undefined;
      if (selected?.isMesh) materialList(selected.material).forEach((item) => setMaterialHighlight(item, digitalTwinTheme.scene.selectionHighlight, 1));
    }
    onPartResolution({
      targetPart: scenario.targetPart,
      matchedNodeNames: matchedNodes.map((node) => node.name || node.type),
      fallbackToWholeModel,
    });
    return restoreAll;
  }, [
    casingDisplayMode,
    couplingGuardVisible,
    modelVersion,
    onPartResolution,
    prepared,
    restoreAll,
    scenario,
    selectedNodeUuid,
  ]);

  useEffect(() => () => disposeClonedModel(prepared.root), [prepared.root]);

  useFrame(({ clock }, delta) => {
    const elapsed = clock.getElapsedTime();
    if (modelVersion === 'enhanced-v1' && prepared.impeller) {
      prepared.impeller.rotation.z += delta * (scenario.id === 'normal' ? 0.22 : 0.38);
      const base = prepared.objectSnapshots.get(prepared.impeller.uuid);
      if (base && scenario.id === 'impeller-imbalance') {
        prepared.impeller.position.x = base.position.x + Math.sin(elapsed * 8.5) * 1.8;
        prepared.impeller.position.y = base.position.y + Math.cos(elapsed * 7.2) * 0.8;
      }
    }
    if (modelVersion === 'enhanced-v1' && scenario.id === 'coupling-misalignment') {
      prepared.couplingNodes.forEach((node, index) => {
        const base = prepared.objectSnapshots.get(node.uuid);
        if (!base) return;
        const phase = elapsed * 5.2 + index * 0.7;
        node.position.x = base.position.x + Math.sin(phase) * 0.75;
        node.position.y = base.position.y + Math.cos(phase) * 0.36;
      });
    }
    if (scenario.id === 'bearing-overheat' || scenario.id === 'coupling-misalignment') {
      const pulse = 0.48 + (Math.sin(elapsed * (scenario.id === 'bearing-overheat' ? 2.2 : 5.2)) + 1) * 0.2;
      activeFaultMaterials.current.forEach((item) => {
        const enhanced = item as Material & { emissiveIntensity?: number };
        if (enhanced.emissiveIntensity !== undefined) enhanced.emissiveIntensity = pulse;
      });
    }
  });

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const info = inspectNode(event.object, modelVersion);
    onSelectNode(info);
    if (import.meta.env.DEV) console.info('[数字孪生] 已选择模型节点', info);
  };

  const scenarioLabel = scenario.id === 'bearing-overheat'
    ? `驱动端轴承 ${scenario.sensors.temperature}℃`
    : scenario.id === 'impeller-imbalance'
      ? '叶轮不平衡'
      : scenario.id === 'coupling-misalignment'
        ? '联轴器不对中'
        : null;

  return <>
    <group scale={prepared.scale} position={prepared.position}>
      <primitive object={prepared.root} onPointerDown={handlePointerDown} />
    </group>
    {scenarioLabel && <Html position={[0, 2.4, 0]} center distanceFactor={7} style={{ pointerEvents: 'none' }}><div className="twin-model-alert">{scenarioLabel}{activeFaultMaterials.current.length === prepared.state.materials.length ? ' · 整机定位' : ''}</div></Html>}
  </>;
}
