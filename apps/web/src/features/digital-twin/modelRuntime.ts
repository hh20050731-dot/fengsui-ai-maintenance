import { Color, Material, Mesh, Object3D, Quaternion, Vector3 } from 'three';
import type { CasingDisplayMode } from './digitalTwinTypes';
import { findSemanticNodes, meshesBelow } from './semanticNodeMapping';

export interface MaterialSnapshot {
  material: Material;
  color?: Color;
  emissive?: Color;
  emissiveIntensity?: number;
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}

export interface ObjectSnapshot {
  object: Object3D;
  visible: boolean;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
}

export interface CapturedModelState {
  materials: MaterialSnapshot[];
  objects: ObjectSnapshot[];
}

export const materialList = (material: Material | Material[]) => Array.isArray(material) ? material : [material];

export function captureModelState(root: Object3D): CapturedModelState {
  const materials: MaterialSnapshot[] = [];
  const objects: ObjectSnapshot[] = [];
  root.traverse((node) => {
    objects.push({
      object: node,
      visible: node.visible,
      position: node.position.clone(),
      quaternion: node.quaternion.clone(),
      scale: node.scale.clone(),
    });
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    materialList(mesh.material).forEach((item) => {
      const enhanced = item as Material & { color?: Color; emissive?: Color; emissiveIntensity?: number };
      materials.push({
        material: item,
        color: enhanced.color?.clone(),
        emissive: enhanced.emissive?.clone(),
        emissiveIntensity: enhanced.emissiveIntensity,
        opacity: item.opacity,
        transparent: item.transparent,
        depthWrite: item.depthWrite,
      });
    });
  });
  return { materials, objects };
}

export function restoreModelState(state: CapturedModelState) {
  state.objects.forEach((snapshot) => {
    snapshot.object.visible = snapshot.visible;
    snapshot.object.position.copy(snapshot.position);
    snapshot.object.quaternion.copy(snapshot.quaternion);
    snapshot.object.scale.copy(snapshot.scale);
  });
  state.materials.forEach((snapshot) => {
    const enhanced = snapshot.material as Material & { color?: Color; emissive?: Color; emissiveIntensity?: number };
    if (snapshot.color && enhanced.color) enhanced.color.copy(snapshot.color);
    if (snapshot.emissive && enhanced.emissive) enhanced.emissive.copy(snapshot.emissive);
    if (snapshot.emissiveIntensity !== undefined) enhanced.emissiveIntensity = snapshot.emissiveIntensity;
    snapshot.material.opacity = snapshot.opacity;
    snapshot.material.transparent = snapshot.transparent;
    snapshot.material.depthWrite = snapshot.depthWrite;
    snapshot.material.needsUpdate = true;
  });
}

export function applyCasingDisplayMode(root: Object3D, mode: CasingDisplayMode) {
  const casingNodes = findSemanticNodes(root, 'casing');
  if (!casingNodes.length) return false;
  casingNodes.forEach((node) => { node.visible = mode !== 'hidden'; });
  if (mode === 'transparent') {
    meshesBelow(casingNodes).forEach((node) => {
      const mesh = node as Mesh;
      materialList(mesh.material).forEach((item) => {
        item.transparent = true;
        item.opacity = 0.18;
        item.depthWrite = false;
        item.needsUpdate = true;
      });
    });
  }
  return true;
}

export function applyCouplingGuardVisibility(root: Object3D, visible: boolean) {
  const guards = findSemanticNodes(root, 'couplingGuard');
  guards.forEach((node) => { node.visible = visible; });
  return guards.length > 0;
}

export function disposeClonedModel(root: Object3D) {
  root.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    materialList(mesh.material).forEach((item) => item.dispose());
  });
}

