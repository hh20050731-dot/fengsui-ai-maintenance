export type FaultScenarioId = 'normal' | 'impeller-imbalance' | 'bearing-overheat' | 'coupling-misalignment';

export type ModelPartKey = 'impeller' | 'bearing' | 'coupling' | 'motor' | 'casing' | 'rotor';
export type TwinRiskLevel = '低' | '中高' | '高';
export type CameraView = 'reset' | 'front' | 'side' | 'top';
export type CasingDisplayMode = 'normal' | 'transparent' | 'hidden';

export interface TwinSensorSnapshot {
  temperature: number;
  vibration: number;
  speed: number;
  current: number;
}

export interface TwinTrendPoint extends TwinSensorSnapshot {
  time: string;
  health: number;
}

export interface TwinTimelineEvent {
  time: string;
  title: string;
  detail: string;
}

export interface FaultScenario {
  id: FaultScenarioId;
  name: string;
  status: string;
  health: number;
  risk: TwinRiskLevel;
  probability: number;
  sensors: TwinSensorSnapshot;
  diagnosis: string;
  advice: string[];
  deadline: string;
  faultPart: string;
  targetPart: ModelPartKey | null;
  highlightColor: string;
  trends: TwinTrendPoint[];
  timeline: TwinTimelineEvent[];
}

export interface ModelNodeInfo {
  uuid: string;
  name: string;
  displayName: string;
  type: string;
  isMesh: boolean;
  parentName: string;
  vertexCount?: number;
  materialNames?: string[];
}

export interface ModelInspection {
  nodeCount: number;
  meshCount: number;
  namedMeshCount: number;
  semanticPartCount: number;
  keyNodeCount: number;
  requiredKeyNodeCount: number;
  missingKeyNodes: string[];
  loadTimeMs: number;
}

export interface PartResolution {
  targetPart: ModelPartKey | null;
  matchedNodeNames: string[];
  fallbackToWholeModel: boolean;
}

export interface FanModelViewerHandle {
  setView: (view: CameraView) => void;
}
