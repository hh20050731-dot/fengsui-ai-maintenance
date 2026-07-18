export type FanModelVersion = 'original' | 'enhanced-v1';

export const defaultFanModelVersion: FanModelVersion = 'enhanced-v1';

export interface FanModelVariant {
  id: FanModelVersion;
  label: string;
  fileName: string;
  url: string;
  semanticNodes: boolean;
}

const modelUrl = (fileName: string) => `${import.meta.env.BASE_URL}models/${fileName}`;

export const fanModelVariants: Record<FanModelVersion, FanModelVariant> = {
  original: {
    id: 'original',
    label: '原始模型',
    fileName: 'induced-draft-fan.glb',
    url: modelUrl('induced-draft-fan.glb'),
    semanticNodes: false,
  },
  'enhanced-v1': {
    id: 'enhanced-v1',
    label: '增强模型 v1',
    fileName: 'induced-draft-fan-enhanced-v1.glb',
    url: modelUrl('induced-draft-fan-enhanced-v1.glb'),
    semanticNodes: true,
  },
};

export const modelVersionSwitcherEnabled = true;

export function isFanModelVersion(value: string | null): value is FanModelVersion {
  return value === 'original' || value === 'enhanced-v1';
}

export function resolveFanModelVersion(value: string | null): FanModelVersion {
  return isFanModelVersion(value) ? value : defaultFanModelVersion;
}
