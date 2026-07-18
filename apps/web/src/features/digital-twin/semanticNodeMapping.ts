import type { Object3D } from 'three';
import type { FaultScenarioId, ModelPartKey } from './digitalTwinTypes';

export type FanSemanticNode =
  | 'root'
  | 'casing'
  | 'impeller'
  | 'motor'
  | 'shaft'
  | 'coupling'
  | 'couplingGuard'
  | 'bearingDrive'
  | 'bearingDriveLocator'
  | 'bearingNonDrive'
  | 'bearingNonDriveLocator'
  | 'base'
  | 'rotationAxis';

export const enhancedV1NodeMapping: Record<FanSemanticNode, readonly string[]> = {
  root: ['Fan_Digital_Twin'],
  casing: ['casing_group'],
  impeller: ['impeller_group'],
  motor: ['motor'],
  shaft: ['main_shaft', 'motor_shaft'],
  coupling: ['coupling_input', 'coupling_element', 'coupling_output'],
  couplingGuard: ['coupling_guard'],
  bearingDrive: ['bearing_drive_housing'],
  bearingDriveLocator: ['bearing_drive_locator'],
  bearingNonDrive: ['bearing_non_drive_housing'],
  bearingNonDriveLocator: ['bearing_non_drive_locator'],
  base: ['drive_base'],
  rotationAxis: ['rotation_axis'],
};

export const enhancedV1KeyNodeNames = [
  'Fan_Digital_Twin',
  'casing_group',
  'impeller_group',
  'motor',
  'motor_shaft',
  'main_shaft',
  'coupling_input',
  'coupling_element',
  'coupling_output',
  'coupling_guard',
  'bearing_drive_housing',
  'bearing_drive_locator',
  'bearing_non_drive_housing',
  'bearing_non_drive_locator',
  'drive_base',
  'rotation_axis',
] as const;

export const scenarioSemanticTargets: Record<FaultScenarioId, readonly FanSemanticNode[]> = {
  normal: [],
  'impeller-imbalance': ['impeller'],
  'bearing-overheat': ['bearingDriveLocator'],
  'coupling-misalignment': ['coupling', 'shaft'],
};

export const enhancedPartSemanticTargets: Record<ModelPartKey, readonly FanSemanticNode[]> = {
  impeller: ['impeller'],
  bearing: ['bearingDriveLocator'],
  coupling: ['coupling', 'shaft'],
  motor: ['motor'],
  casing: ['casing'],
  rotor: ['impeller', 'shaft'],
};

const semanticLabels: Record<FanSemanticNode, string> = {
  root: '引风机数字孪生',
  casing: '机壳与风道',
  impeller: '叶轮',
  motor: '电机',
  shaft: '主轴 / 电机轴',
  coupling: '联轴器',
  couplingGuard: '联轴器防护罩',
  bearingDrive: '驱动端轴承',
  bearingDriveLocator: '驱动端轴承',
  bearingNonDrive: '非驱动端轴承',
  bearingNonDriveLocator: '非驱动端轴承',
  base: '传动系统底座',
  rotationAxis: '旋转轴线',
};

export interface EnhancedNodeValidation {
  found: string[];
  missing: string[];
  complete: boolean;
}

export function validateEnhancedV1Nodes(root: Object3D): EnhancedNodeValidation {
  const found = enhancedV1KeyNodeNames.filter((name) => Boolean(root.getObjectByName(name)));
  const missing = enhancedV1KeyNodeNames.filter((name) => !root.getObjectByName(name));
  return { found: [...found], missing: [...missing], complete: missing.length === 0 };
}

export function findSemanticNodes(root: Object3D, semantic: FanSemanticNode): Object3D[] {
  return enhancedV1NodeMapping[semantic]
    .map((name) => root.getObjectByName(name))
    .filter((node): node is Object3D => Boolean(node));
}

export function semanticNodeForObject(node: Object3D): FanSemanticNode | null {
  let current: Object3D | null = node;
  while (current) {
    const match = (Object.keys(enhancedV1NodeMapping) as FanSemanticNode[])
      .find((semantic) => enhancedV1NodeMapping[semantic].some((name) => name === current!.name));
    if (match) return match;
    current = current.parent;
  }
  return null;
}

export function semanticDisplayName(node: Object3D): string {
  let current: Object3D | null = node;
  while (current) {
    const configuredName = current.userData.display_name_zh;
    if (typeof configuredName === 'string' && configuredName.trim()) return configuredName.trim();
    current = current.parent;
  }
  const semantic = semanticNodeForObject(node);
  return semantic ? semanticLabels[semantic] : (node.name || `未命名-${node.type}`);
}

export function meshesBelow(nodes: Object3D[]): Object3D[] {
  const matches = new Map<string, Object3D>();
  nodes.forEach((node) => {
    node.traverse((child) => {
      if ((child as Object3D & { isMesh?: boolean }).isMesh) matches.set(child.uuid, child);
    });
  });
  return [...matches.values()];
}
