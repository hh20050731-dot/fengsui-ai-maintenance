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
] as const;

export function resolveDigitalTwinEquipment(value: string | null) {
  return digitalTwinEquipment.find((item) => item.queryId === value || item.deviceId === value) ?? digitalTwinEquipment[0];
}
