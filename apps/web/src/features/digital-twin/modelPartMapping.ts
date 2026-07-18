import type { Object3D } from 'three';
import type { ModelPartKey } from './digitalTwinTypes';
import type { FanModelVersion } from './modelVariants';
import { enhancedPartSemanticTargets, findSemanticNodes, meshesBelow } from './semanticNodeMapping';

export const modelPartMapping: Record<ModelPartKey, string[]> = {
  impeller: ['impeller', 'wheel', 'fanwheel', 'fan_wheel', '叶轮'],
  bearing: ['bearing', 'bearingseat', 'bearing_seat', '轴承'],
  coupling: ['coupling', 'coupler', '联轴器'],
  motor: ['motor', 'electricmotor', 'electric_motor', '电机'],
  casing: ['casing', 'housing', 'shell', '蜗壳', '机壳'],
  rotor: ['rotor', 'shaft', 'spindle', '转子', '主轴'],
};

const normalizeName = (name: string) => name.toLowerCase().replace(/[\s._-]/g, '');

export function findModelPartNodes(root: Object3D, part: ModelPartKey | null, modelVersion: FanModelVersion = 'original') {
  if (!part) return [];
  if (modelVersion === 'enhanced-v1') {
    const semanticNodes = enhancedPartSemanticTargets[part].flatMap((semantic) => findSemanticNodes(root, semantic));
    return meshesBelow(semanticNodes);
  }
  const keywords = modelPartMapping[part].map(normalizeName);
  const matches: Object3D[] = [];
  root.traverse((node) => {
    if (!('isMesh' in node) || !(node as Object3D & { isMesh?: boolean }).isMesh) return;
    const normalized = normalizeName(node.name);
    if (normalized && keywords.some((keyword) => normalized.includes(keyword))) matches.push(node);
  });
  return matches;
}

export function countSemanticParts(root: Object3D, modelVersion: FanModelVersion = 'original') {
  const matched = new Set<string>();
  (Object.keys(modelPartMapping) as ModelPartKey[]).forEach((part) => {
    findModelPartNodes(root, part, modelVersion).forEach((node) => matched.add(node.uuid));
  });
  return matched.size;
}
