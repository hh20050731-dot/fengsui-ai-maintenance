import { defaultFanModelVersion, fanModelVariants } from './modelVariants';

const defaultFanModelVariant = fanModelVariants[defaultFanModelVersion];

export const FAN_MODEL_FILE = defaultFanModelVariant.fileName;
export const FAN_MODEL_URL = defaultFanModelVariant.url;

export const digitalTwinEquipment = [
  {
    queryId: 'IDF-01',
    deviceId: 'IDF-001',
    deviceName: '1号引风机',
    equipmentType: '离心式引风机',
    location: '焚烧间 A 区',
    online: true,
    modelUrl: FAN_MODEL_URL,
  },
  { queryId: 'IDF-002', deviceId: 'IDF-002', deviceName: '2号引风机', equipmentType: '离心式引风机', location: '焚烧间 B 区', online: true, modelUrl: FAN_MODEL_URL },
  { queryId: 'FWP-001', deviceId: 'FWP-001', deviceName: '1号给水泵', equipmentType: '多级给水泵', location: '汽机房 A 区', online: true, modelUrl: '' },
  { queryId: 'FWP-002', deviceId: 'FWP-002', deviceName: '2号给水泵', equipmentType: '多级给水泵', location: '汽机房 B 区', online: true, modelUrl: '' },
  { queryId: 'CWP-001', deviceId: 'CWP-001', deviceName: '1号循环水泵', equipmentType: '循环水泵', location: '循环水泵房 A 区', online: true, modelUrl: '' },
  { queryId: 'CWP-002', deviceId: 'CWP-002', deviceName: '2号循环水泵', equipmentType: '循环水泵', location: '循环水泵房 B 区', online: true, modelUrl: '' },
  { queryId: 'GRB-001', deviceId: 'GRB-001', deviceName: '炉排减速机', equipmentType: '炉排驱动减速机', location: '焚烧炉底部', online: true, modelUrl: '' },
  { queryId: 'ACP-001', deviceId: 'ACP-001', deviceName: '空压机', equipmentType: '螺杆空气压缩机', location: '空压机房', online: true, modelUrl: '' },
  { queryId: 'LCP-001', deviceId: 'LCP-001', deviceName: '渗滤液处理泵', equipmentType: '渗滤液泵', location: '渗滤液处理站', online: true, modelUrl: '' },
  { queryId: 'PAF-001', deviceId: 'PAF-001', deviceName: '一次风机', equipmentType: '离心式一次风机', location: '焚烧间送风区', online: true, modelUrl: FAN_MODEL_URL },
  { queryId: 'SAF-001', deviceId: 'SAF-001', deviceName: '二次风机', equipmentType: '离心式二次风机', location: '焚烧间二次风区', online: true, modelUrl: FAN_MODEL_URL },
  { queryId: 'CLP-001', deviceId: 'CLP-001', deviceName: '冷却水泵', equipmentType: '冷却水循环泵', location: '冷却水泵房', online: true, modelUrl: '' },
] as const;

export function resolveDigitalTwinEquipment(value: string | null) {
  return digitalTwinEquipment.find((item) => item.queryId === value || item.deviceId === value) ?? digitalTwinEquipment[0];
}
