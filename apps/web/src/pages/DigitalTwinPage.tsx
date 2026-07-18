import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Box, CheckCircle2, FileBox, Info } from 'lucide-react';
import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Equipment } from '@fengsui/shared';
import { ErrorState, Loading } from '../components/ui';
import { DiagnosisPanel } from '../features/digital-twin/components/DiagnosisPanel';
import { EquipmentList } from '../features/digital-twin/components/EquipmentList';
import { FanModelViewer } from '../features/digital-twin/components/FanModelViewer';
import { FaultScenarioPanel } from '../features/digital-twin/components/FaultScenarioPanel';
import { SensorStatusPanel } from '../features/digital-twin/components/SensorStatusPanel';
import { TrendCharts } from '../features/digital-twin/components/TrendCharts';
import type {
  CasingDisplayMode,
  FanModelViewerHandle,
  FaultScenarioId,
  ModelInspection,
  ModelNodeInfo,
  PartResolution,
} from '../features/digital-twin/digitalTwinTypes';
import { resolveDigitalTwinEquipment } from '../features/digital-twin/equipmentConfig';
import { faultScenarios, isFaultScenarioId } from '../features/digital-twin/faultScenarios';
import {
  fanModelVariants,
  modelVersionSwitcherEnabled,
  resolveFanModelVersion,
} from '../features/digital-twin/modelVariants';
import type { FanModelVersion } from '../features/digital-twin/modelVariants';
import { api } from '../services/api';
import '../features/digital-twin/digital-twin.css';

export function DigitalTwinPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const equipment = useMemo(() => resolveDigitalTwinEquipment(params.get('equipment')), [params]);
  const modelVersion = resolveFanModelVersion(params.get('model'));
  const modelVariant = fanModelVariants[modelVersion];
  const faultValue = params.get('fault');
  const scenarioId: FaultScenarioId = isFaultScenarioId(faultValue) ? faultValue : 'normal';
  const scenario = faultScenarios[scenarioId];
  const highRisk = scenario.risk === '高';
  const viewer = useRef<FanModelViewerHandle>(null);
  const [selectedNode, setSelectedNode] = useState<ModelNodeInfo | null>(null);
  const [inspection, setInspection] = useState<ModelInspection | null>(null);
  const [partResolution, setPartResolution] = useState<PartResolution | null>(null);
  const [casingDisplayMode, setCasingDisplayMode] = useState<CasingDisplayMode>('normal');
  const [couplingGuardVisible, setCouplingGuardVisible] = useState(true);
  const equipmentQuery = useQuery({
    queryKey: ['equipment', equipment.deviceId],
    queryFn: () => api<Equipment>(`/equipment/${equipment.deviceId}`),
  });

  const changeScenario = (next: FaultScenarioId) => {
    const nextParams = new URLSearchParams(params);
    nextParams.set('equipment', equipment.queryId);
    nextParams.set('fault', next);
    setParams(nextParams);
    setSelectedNode(null);
  };

  const changeModelVersion = (next: FanModelVersion) => {
    if (!modelVersionSwitcherEnabled) return;
    const nextParams = new URLSearchParams(params);
    nextParams.set('equipment', equipment.queryId);
    if (next === 'enhanced-v1') nextParams.delete('model');
    else nextParams.set('model', next);
    setParams(nextParams);
    setSelectedNode(null);
    setInspection(null);
    setPartResolution(null);
    setCasingDisplayMode('normal');
    setCouplingGuardVisible(true);
  };

  useEffect(() => {
    setSelectedNode(null);
    setInspection(null);
    setPartResolution(null);
    setCasingDisplayMode('normal');
    setCouplingGuardVisible(true);
  }, [modelVariant.url]);

  if (equipmentQuery.isLoading) return <Loading label="正在读取引风机台账…" />;
  if (equipmentQuery.isError) return <ErrorState error={equipmentQuery.error} retry={() => equipmentQuery.refetch()} />;

  return (
    <div className="digital-twin-page">
      <section className={clsx('digital-twin-shell', highRisk && 'is-high-risk')} data-scenario={scenario.id}>
        <div className="twin-page-header">
          <div>
            <h1 className="twin-page-title">3D数字孪生工作台</h1>
            <p className="twin-page-subtitle">{equipment.deviceName} · {equipment.queryId} · 三维状态与故障场景联动演示</p>
          </div>
          <div className="twin-page-actions">
            <span className="twin-demo-label">当前为模拟演示数据，不代表真实设备诊断结果。</span>
            <button className="twin-back-button" onClick={() => navigate(`/equipment/${equipment.deviceId}`)}>
              <ArrowLeft size={14} />返回设备详情
            </button>
          </div>
        </div>

        <div className={clsx('twin-alert-strip', highRisk && 'twin-alert-strip--danger')} data-testid="twin-alert-strip">
          <div className="twin-alert-strip__title">
            {highRisk ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
            <span>{highRisk ? `检测到：${scenario.name}异常` : '当前设备运行稳定'}</span>
          </div>
          <div>{scenario.status} · 数据与规则场景同步</div>
        </div>

        <div className="twin-workbench" data-testid="twin-workbench">
          <aside className="twin-scene-rail">
            <EquipmentList equipment={equipment} />
            <FaultScenarioPanel value={scenarioId} onChange={changeScenario} />
          </aside>

          <section className="twin-model-panel" data-testid="twin-model-panel">
            <div className="twin-model-header">
              <div>
                <div className="twin-model-heading-row">
                  <h2 className="twin-model-title">三维模型 · {equipment.deviceName}</h2>
                  {modelVersionSwitcherEnabled && (
                    <label className="twin-model-version-control">
                      <span>测试模型</span>
                      <select
                        data-testid="model-version-select"
                        value={modelVersion}
                        onChange={(event) => changeModelVersion(event.target.value as FanModelVersion)}
                      >
                        <option value="enhanced-v1">增强模型 v1</option>
                        <option value="original">原始模型</option>
                      </select>
                    </label>
                  )}
                </div>
                <div className="twin-model-path">
                  <FileBox size={12} />
                  <span className="twin-data">{modelVariant.url}</span>
                </div>
              </div>
              <div className="text-right">
                <div className={clsx('twin-model-state', highRisk && 'is-danger')}>{scenario.name}</div>
                <div className="twin-panel__meta mt-1">
                  {partResolution?.fallbackToWholeModel
                    ? '整机高亮降级'
                    : partResolution?.matchedNodeNames.length
                      ? `定位 ${partResolution.matchedNodeNames.length} 个节点`
                      : '原始材质'}
                </div>
              </div>
            </div>

            <div className="twin-model-viewport">
              <FanModelViewer
                key={modelVariant.url}
                ref={viewer}
                modelUrl={modelVariant.url}
                modelVersion={modelVersion}
                scenario={scenario}
                casingDisplayMode={casingDisplayMode}
                couplingGuardVisible={couplingGuardVisible}
                selectedNode={selectedNode}
                onCasingDisplayModeChange={setCasingDisplayMode}
                onCouplingGuardVisibleChange={setCouplingGuardVisible}
                onSelectNode={setSelectedNode}
                onInspection={setInspection}
                onPartResolution={setPartResolution}
                onSwitchToOriginal={() => changeModelVersion('original')}
              />
            </div>

            <div className="twin-model-footer">
              <div className="twin-model-footer__summary">
                <Info className="mt-0.5 shrink-0" size={13} />
                <span>
                  {!inspection
                    ? '模型加载完成后将显示节点结构检查结果。'
                    : modelVersion === 'enhanced-v1'
                      ? inspection.missingKeyNodes.length
                        ? `增强模型已加载，但缺少 ${inspection.missingKeyNodes.length} 个语义节点；缺失能力将安全降级。`
                        : `增强模型 ${inspection.keyNodeCount}/${inspection.requiredKeyNodeCount} 个关键语义节点验证通过，可进行部件级交互。`
                      : inspection.meshCount <= 1
                        ? '当前模型未拆分为独立部件，仅支持整机点击、高亮和故障效果。'
                        : `模型包含 ${inspection.meshCount} 个独立 Mesh；语义部件无法匹配时自动使用整机效果。`}
                </span>
              </div>
              {inspection && (
                <div className="twin-data flex items-center gap-2 whitespace-nowrap">
                  <Box size={12} />
                  {inspection.nodeCount} 个节点 / {inspection.meshCount} 个网格 / {Math.round(inspection.loadTimeMs)} ms
                </div>
              )}
            </div>
          </section>

          <aside className="twin-right-rail">
            <SensorStatusPanel scenario={scenario} />
            <DiagnosisPanel
              scenario={scenario}
              deviceId={equipment.deviceId}
              deviceName={equipment.deviceName}
              selectedNode={selectedNode}
              partResolution={partResolution}
            />
          </aside>
        </div>
        <TrendCharts scenario={scenario} />
      </section>
    </div>
  );
}
