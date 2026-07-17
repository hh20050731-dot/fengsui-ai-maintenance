import { Html, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Box3, Color, Group, Material, Mesh, Object3D, Vector3 } from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { countSemanticParts, findModelPartNodes } from '../modelPartMapping';
import { FAN_MODEL_URL } from '../equipmentConfig';
import type { FaultScenario, ModelInspection, ModelNodeInfo, PartResolution } from '../digitalTwinTypes';

interface MaterialSnapshot {
  material: Material;
  color?: Color;
  emissive?: Color;
  emissiveIntensity?: number;
  opacity: number;
  transparent: boolean;
}

const materialList = (material: Material | Material[]) => Array.isArray(material) ? material : [material];

function inspectNode(node: Object3D): ModelNodeInfo {
  const mesh = node as Mesh;
  const materials = mesh.isMesh ? materialList(mesh.material) : [];
  return {
    uuid: node.uuid,
    name: node.name || `未命名-${node.type}`,
    type: node.type,
    isMesh: Boolean(mesh.isMesh),
    parentName: node.parent?.name || 'Scene',
    vertexCount: mesh.isMesh ? mesh.geometry.getAttribute('position')?.count : undefined,
    materialNames: materials.map((material) => material.name || material.type),
  };
}

function setMaterialHighlight(material: Material, colorValue: string, intensity: number) {
  const target = new Color(colorValue);
  const enhanced = material as Material & { color?: Color; emissive?: Color; emissiveIntensity?: number };
  enhanced.color?.lerp(target, 0.48);
  if (enhanced.emissive) {
    enhanced.emissive.copy(target).multiplyScalar(0.16);
    enhanced.emissiveIntensity = intensity;
  }
  material.needsUpdate = true;
}

export function ModelScene({ modelUrl, scenario, selectedNodeUuid, onSelectNode, onInspection, onFit, onPartResolution }: {
  modelUrl: string;
  scenario: FaultScenario;
  selectedNodeUuid: string | null;
  onSelectNode: (node: ModelNodeInfo | null) => void;
  onInspection: (inspection: ModelInspection) => void;
  onFit: (radius: number) => void;
  onPartResolution: (resolution: PartResolution) => void;
}) {
  const gltf = useGLTF(modelUrl);
  const effectGroup = useRef<Group>(null);
  const activeFaultMaterials = useRef<Material[]>([]);
  const loggedScene = useRef(false);
  const prepared = useMemo(() => {
    const root = clone(gltf.scene);
    const meshes: Mesh[] = [];
    const snapshots: MaterialSnapshot[] = [];
    root.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      meshes.push(mesh);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const clonedMaterials = materialList(mesh.material).map((material) => material.clone());
      mesh.material = Array.isArray(mesh.material) ? clonedMaterials : clonedMaterials[0]!;
      clonedMaterials.forEach((material) => {
        const enhanced = material as Material & { color?: Color; emissive?: Color; emissiveIntensity?: number };
        snapshots.push({
          material,
          color: enhanced.color?.clone(),
          emissive: enhanced.emissive?.clone(),
          emissiveIntensity: enhanced.emissiveIntensity,
          opacity: material.opacity,
          transparent: material.transparent,
        });
      });
    });
    const bounds = new Box3().setFromObject(root);
    const center = bounds.getCenter(new Vector3());
    const size = bounds.getSize(new Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z, 0.001);
    const scale = 4.8 / maxDimension;
    const radius = Math.max(size.length() * scale * 0.5, 1);
    return { root, meshes, snapshots, center: center.multiplyScalar(-1), scale, radius };
  }, [gltf.scene]);

  const restoreMaterials = useCallback(() => {
    prepared.snapshots.forEach((snapshot) => {
      const enhanced = snapshot.material as Material & { color?: Color; emissive?: Color; emissiveIntensity?: number };
      if (snapshot.color && enhanced.color) enhanced.color.copy(snapshot.color);
      if (snapshot.emissive && enhanced.emissive) enhanced.emissive.copy(snapshot.emissive);
      if (snapshot.emissiveIntensity !== undefined) enhanced.emissiveIntensity = snapshot.emissiveIntensity;
      snapshot.material.opacity = snapshot.opacity;
      snapshot.material.transparent = snapshot.transparent;
      snapshot.material.needsUpdate = true;
    });
  }, [prepared.snapshots]);

  useEffect(() => {
    onFit(prepared.radius);
    let nodeCount = 0;
    let namedMeshCount = 0;
    prepared.root.traverse((node) => {
      nodeCount += 1;
      if ((node as Mesh).isMesh && node.name) namedMeshCount += 1;
    });
    onInspection({ nodeCount, meshCount: prepared.meshes.length, namedMeshCount, semanticPartCount: countSemanticParts(prepared.root) });
    if (import.meta.env.DEV && !loggedScene.current) {
      loggedScene.current = true;
      console.groupCollapsed(`[数字孪生] GLB 节点树 · ${modelUrl}`);
      const printTree = (node: Object3D, depth = 0) => {
        const info = inspectNode(node);
        console.info(`${'  '.repeat(depth)}${info.name}`, { type: info.type, isMesh: info.isMesh, parent: info.parentName, uuid: info.uuid });
        node.children.forEach((child) => printTree(child, depth + 1));
      };
      printTree(prepared.root);
      console.groupEnd();
    }
  }, [modelUrl, onFit, onInspection, prepared]);

  useEffect(() => {
    restoreMaterials();
    const matchedNodes = findModelPartNodes(prepared.root, scenario.targetPart);
    const fallbackToWholeModel = Boolean(scenario.targetPart && matchedNodes.length === 0);
    const affectedMeshes = scenario.id === 'normal' ? [] : (fallbackToWholeModel ? prepared.meshes : matchedNodes as Mesh[]);
    const faultMaterials = affectedMeshes.flatMap((mesh) => materialList(mesh.material));
    faultMaterials.forEach((material) => setMaterialHighlight(material, scenario.highlightColor, 0.72));
    activeFaultMaterials.current = faultMaterials;
    if (selectedNodeUuid) {
      const selected = prepared.root.getObjectByProperty('uuid', selectedNodeUuid) as Mesh | undefined;
      if (selected?.isMesh) materialList(selected.material).forEach((material) => setMaterialHighlight(material, '#315a78', 1));
    }
    onPartResolution({ targetPart: scenario.targetPart, matchedNodeNames: matchedNodes.map((node) => node.name || node.type), fallbackToWholeModel });
  }, [onPartResolution, prepared, restoreMaterials, scenario, selectedNodeUuid]);

  useEffect(() => () => prepared.snapshots.forEach(({ material }) => material.dispose()), [prepared.snapshots]);

  useFrame(({ clock }) => {
    if (!effectGroup.current) return;
    const elapsed = clock.getElapsedTime();
    effectGroup.current.position.x = scenario.id === 'impeller-imbalance' ? Math.sin(elapsed * 9) * 0.015 : 0;
    effectGroup.current.position.y = scenario.id === 'impeller-imbalance' ? Math.cos(elapsed * 7) * 0.008 : 0;
    effectGroup.current.rotation.z = scenario.id === 'coupling-misalignment' ? Math.sin(elapsed * 5) * 0.006 : 0;
    if (scenario.id === 'bearing-overheat' || scenario.id === 'coupling-misalignment') {
      const pulse = 0.42 + (Math.sin(elapsed * (scenario.id === 'bearing-overheat' ? 2.2 : 5.2)) + 1) * 0.12;
      activeFaultMaterials.current.forEach((material) => {
        const enhanced = material as Material & { emissiveIntensity?: number };
        if (enhanced.emissiveIntensity !== undefined) enhanced.emissiveIntensity = pulse;
      });
    }
  });

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const node = event.object;
    const info = inspectNode(node);
    onSelectNode(info);
    if (import.meta.env.DEV) console.info('[数字孪生] 已选择模型节点', { ...info, object: node });
  };

  return <>
    <group ref={effectGroup} scale={prepared.scale}>
      <primitive object={prepared.root} position={prepared.center} onPointerDown={handlePointerDown} />
    </group>
    {scenario.id === 'bearing-overheat' && <Html position={[0, 2.75, 0]} center distanceFactor={7} style={{ pointerEvents: 'none' }}><div className="whitespace-nowrap rounded border border-red-300 bg-white/95 px-2 py-1 text-xs font-semibold text-red-700">轴承温度 {scenario.sensors.temperature}℃{activeFaultMaterials.current.length === prepared.snapshots.length ? ' · 整机定位' : ''}</div></Html>}
  </>;
}

useGLTF.preload(FAN_MODEL_URL);
