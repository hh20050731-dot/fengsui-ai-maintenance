export type EquipmentModelId =
  | 'induced-draft-fan'
  | 'industrial-motor'
  | 'bearing-assembly'
  | 'flexible-coupling'
  | 'feed-water-pump'
  | 'circulation-water-pump'
  | 'grate-gearbox'
  | 'air-compressor'
  | 'leachate-pump';

export type ModelLod = 'lod0' | 'lod1' | 'lod2';

export interface EquipmentModelDefinition {
  id: EquipmentModelId;
  name: string;
  supportedDeviceIds: string[];
  lods: Record<ModelLod, string>;
  semanticNodes: string[];
  supportsRotation: boolean;
  supportsCasingTransparency: boolean;
  supportsGuardToggle: boolean;
  dataBoundary: string;
}

const modelUrl = (fileName: string) => `${import.meta.env.BASE_URL}models/${fileName}`;
const boundary = '比赛原型轻量语义模型，不是厂家精确CAD，不用于制造、安装或安全校核。';

export const equipmentModels: Record<EquipmentModelId, EquipmentModelDefinition> = {
  'induced-draft-fan': {
    id: 'induced-draft-fan', name: '离心式风机', supportedDeviceIds: ['IDF-001', 'IDF-002', 'PAF-001', 'SAF-001'],
    lods: { lod0: modelUrl('induced-draft-fan-lod0.glb'), lod1: modelUrl('induced-draft-fan-lod1.glb'), lod2: modelUrl('induced-draft-fan-lod2.glb') },
    semanticNodes: ['casing_group', 'impeller_group', 'motor', 'main_shaft', 'coupling_element', 'bearing_drive_locator', 'rotation_axis'],
    supportsRotation: true, supportsCasingTransparency: true, supportsGuardToggle: true, dataBoundary: boundary,
  },
  'industrial-motor': {
    id: 'industrial-motor', name: '工业电机', supportedDeviceIds: [],
    lods: { lod0: modelUrl('industrial-motor-lod0.glb'), lod1: modelUrl('industrial-motor-lod1.glb'), lod2: modelUrl('industrial-motor-lod2.glb') },
    semanticNodes: ['motor', 'motor_shaft', 'motor_temperature_sensor', 'motor_vibration_sensor', 'rotation_axis'],
    supportsRotation: true, supportsCasingTransparency: false, supportsGuardToggle: false, dataBoundary: boundary,
  },
  'bearing-assembly': {
    id: 'bearing-assembly', name: '轴承组件', supportedDeviceIds: [],
    lods: { lod0: modelUrl('bearing-assembly-lod0.glb'), lod1: modelUrl('bearing-assembly-lod1.glb'), lod2: modelUrl('bearing-assembly-lod2.glb') },
    semanticNodes: ['bearing_drive_housing', 'bearing_drive_temperature_sensor', 'bearing_drive_vibration_sensor', 'bearing_drive_fault_locator', 'rotation_axis'],
    supportsRotation: true, supportsCasingTransparency: true, supportsGuardToggle: false, dataBoundary: boundary,
  },
  'flexible-coupling': {
    id: 'flexible-coupling', name: '弹性联轴器', supportedDeviceIds: [],
    lods: { lod0: modelUrl('flexible-coupling-lod0.glb'), lod1: modelUrl('flexible-coupling-lod1.glb'), lod2: modelUrl('flexible-coupling-lod2.glb') },
    semanticNodes: ['coupling_input', 'coupling_element', 'coupling_output', 'coupling_guard', 'coupling_misalignment_locator', 'rotation_axis'],
    supportsRotation: true, supportsCasingTransparency: false, supportsGuardToggle: true, dataBoundary: boundary,
  },
  'feed-water-pump': {
    id: 'feed-water-pump', name: '给水泵', supportedDeviceIds: ['FWP-001', 'FWP-002'],
    lods: { lod0: modelUrl('feed-water-pump-lod0.glb'), lod1: modelUrl('feed-water-pump-lod1.glb'), lod2: modelUrl('feed-water-pump-lod2.glb') },
    semanticNodes: ['motor', 'coupling_element', 'feed_water_pump_group', 'feed_water_inlet_pressure_sensor', 'feed_water_outlet_pressure_sensor', 'feed_water_impeller_locator', 'feed_water_seal_locator'],
    supportsRotation: true, supportsCasingTransparency: true, supportsGuardToggle: true, dataBoundary: boundary,
  },
  'circulation-water-pump': {
    id: 'circulation-water-pump', name: '循环水泵', supportedDeviceIds: ['CWP-001', 'CWP-002', 'CLP-001'],
    lods: { lod0: modelUrl('circulation-water-pump-lod0.glb'), lod1: modelUrl('circulation-water-pump-lod1.glb'), lod2: modelUrl('circulation-water-pump-lod2.glb') },
    semanticNodes: ['motor', 'circulation_water_pump_group', 'circulation_water_impeller_locator', 'circulation_water_inlet_pressure_sensor', 'circulation_water_outlet_pressure_sensor'],
    supportsRotation: true, supportsCasingTransparency: true, supportsGuardToggle: true, dataBoundary: boundary,
  },
  'grate-gearbox': {
    id: 'grate-gearbox', name: '炉排减速机', supportedDeviceIds: ['GRB-001'],
    lods: { lod0: modelUrl('grate-gearbox-lod0.glb'), lod1: modelUrl('grate-gearbox-lod1.glb'), lod2: modelUrl('grate-gearbox-lod2.glb') },
    semanticNodes: ['gearbox_housing', 'gear_1', 'gear_2', 'gear_3', 'gearbox_oil_temperature_sensor', 'gearbox_lubrication_locator'],
    supportsRotation: true, supportsCasingTransparency: true, supportsGuardToggle: false, dataBoundary: boundary,
  },
  'air-compressor': {
    id: 'air-compressor', name: '空气压缩机', supportedDeviceIds: ['ACP-001'],
    lods: { lod0: modelUrl('air-compressor-lod0.glb'), lod1: modelUrl('air-compressor-lod1.glb'), lod2: modelUrl('air-compressor-lod2.glb') },
    semanticNodes: ['motor', 'compressor_casing', 'screw_rotor_1', 'screw_rotor_2', 'compressor_discharge_pressure_sensor', 'compressor_pressure_fault_locator'],
    supportsRotation: true, supportsCasingTransparency: true, supportsGuardToggle: true, dataBoundary: boundary,
  },
  'leachate-pump': {
    id: 'leachate-pump', name: '渗滤液泵', supportedDeviceIds: ['LCP-001'],
    lods: { lod0: modelUrl('leachate-pump-lod0.glb'), lod1: modelUrl('leachate-pump-lod1.glb'), lod2: modelUrl('leachate-pump-lod2.glb') },
    semanticNodes: ['leachate_motor', 'leachate_impeller_housing', 'leachate_intake_cage', 'leachate_current_sensor', 'leachate_blockage_locator'],
    supportsRotation: true, supportsCasingTransparency: true, supportsGuardToggle: false, dataBoundary: boundary,
  },
};

export const equipmentModelLibrary = Object.values(equipmentModels);

export function isEquipmentModelId(value: string | null): value is EquipmentModelId {
  return Boolean(value && Object.prototype.hasOwnProperty.call(equipmentModels, value));
}

export function resolveEquipmentModel(deviceId: string): EquipmentModelDefinition {
  return equipmentModelLibrary.find((item) => item.supportedDeviceIds.includes(deviceId)) ?? equipmentModels['industrial-motor'];
}

export function resolveModelLod(value: string | null): ModelLod {
  return value === 'lod1' || value === 'lod2' ? value : 'lod0';
}
