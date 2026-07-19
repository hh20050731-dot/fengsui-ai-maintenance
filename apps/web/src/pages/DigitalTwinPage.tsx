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
import { GeneralEquipmentViewer } from '../features/digital-twin/components/GeneralEquipmentViewer';
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
import { equipmentModelLibrary, equipmentModels, isEquipmentModelId, resolveEquipmentModel, resolveModelLod } from '../features/digital-twin/equipmentModels';
import type { EquipmentModelId, ModelLod } from '../features/digital-twin/equipmentModels';
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
  const assetId = isEquipmentModelId(params.get('asset')) ? params.get('asset') as EquipmentModelId : null;
  const lod = resolveModelLod(params.get('lod'));
  const equipmentModel = assetId ? equipmentModels[assetId] : resolveEquipmentModel(equipment.deviceId);
  const useSpecialFanViewer = equipment.deviceId === 'IDF-001' && !assetId;
  const modelVersion = resolveFanModelVersion(params.get('model'));
  const modelVariant = fanModelVariants[modelVersion];
  const faultValue = params.get('fault');
  const scenarioId: FaultScenarioId = useSpecialFanViewer && isFaultScenarioId(faultValue) ? faultValue : 'normal';
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
  const actualModelUrl = useSpecialFanViewer ? modelVariant.url : equipmentModel.lods[lod];

  const changeEquipment = (deviceId: string) => {
    const nextParams = new URLSearchParams();
    nextParams.set('equipment', deviceId);
    setParams(nextParams);
    setSelectedNode(null);
    setInspection(null);
  };

  const changeLod = (next: ModelLod) => {
    const nextParams = new URLSearchParams(params);
    if (next === 'lod0') nextParams.delete('lod'); else nextParams.set('lod', next);
    setParams(nextParams);
  };

  const changeAsset = (next: string) => {
    const nextParams = new URLSearchParams(params);
    if (!next) nextParams.delete('asset'); else nextParams.set('asset', next);
    nextParams.delete('model');
    nextParams.delete('fault');
    setParams(nextParams);
    setSelectedNode(null);
    setInspection(null);
  };

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
  }, [actualModelUrl]);

  if (equipmentQuery.isLoading) return <Loading label="正在读取引风机台账…" />;
  if (equipmentQuery.isError) return <ErrorState error={equipmentQuery.error} retry={() => equipmentQuery.refetch()} />;
  const currentEquipment = equipmentQuery.data!;
  const genericFaultActive = !useSpecialFanViewer && ['二级预警', '高风险'].includes(currentEquipment.riskLevel);
  const displayHighRisk = useSpecialFanViewer ? highRisk : genericFaultActive;

  return (
    <div className="digital-twin-page">
      <section className={clsx('digital-twin-shell', displayHighRisk && 'is-high-risk')} data-scenario={scenario.id}>
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

        <div className={clsx('twin-alert-strip', displayHighRisk && 'twin-alert-strip--danger')} data-testid="twin-alert-strip">
          <div className="twin-alert-strip__title">
            {displayHighRisk ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
            <span>{useSpecialFanViewer ? (highRisk ? `检测到：${scenario.name}异常` : '当前设备运行稳定') : `${currentEquipment.deviceName}：${currentEquipment.riskLevel}`}</span>
          </div>
          <div>{useSpecialFanViewer ? scenario.status : `${currentEquipment.operatingCondition} · 健康度 ${currentEquipment.healthScore}`} · 数据与规则场景同步</div>
        </div>

        <div className="twin-workbench" data-testid="twin-workbench">
          <aside className="twin-scene-rail">
            <EquipmentList equipment={equipment} onSelect={changeEquipment} />
            {useSpecialFanViewer ? <FaultScenarioPanel value={scenarioId} onChange={changeScenario} /> : <section className="twin-panel p-3 text-xs leading-5 text-[var(--twin-text-secondary)]"><strong className="block text-[var(--twin-text)]">通用语义模型</strong><p className="mt-2">风险部件、测点和故障定位节点来自当前模型；不套用引风机专用故障场景。</p><p className="mt-2 text-[10px] text-[var(--twin-text-muted)]">{equipmentModel.dataBoundary}</p></section>}
          </aside>

          <section className="twin-model-panel" data-testid="twin-model-panel">
            <div className="twin-model-header">
              <div>
                <div className="twin-model-heading-row">
                  <h2 className="twin-model-title">三维模型 · {equipment.deviceName}</h2>
                  <label className="twin-model-version-control">
                    <span>模型资产</span>
                    <select value={assetId ?? ''} onChange={(event) => changeAsset(event.target.value)}>
                      <option value="">设备类型自动匹配</option>
                      {equipmentModelLibrary.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </label>
                  {useSpecialFanViewer && modelVersionSwitcherEnabled && (
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
                  {!useSpecialFanViewer && <label className="twin-model-version-control"><span>细节层级</span><select value={lod} onChange={(event) => changeLod(event.target.value as ModelLod)}><option value="lod0">LOD0 精细</option><option value="lod1">LOD1 平衡</option><option value="lod2">LOD2 轻量</option></select></label>}
                </div>
                <div className="twin-model-path">
                  <FileBox size={12} />
                  <span className="twin-data">{actualModelUrl}</span>
                </div>
              </div>
              <div className="text-right">
                <div className={clsx('twin-model-state', displayHighRisk && 'is-danger')}>{useSpecialFanViewer ? scenario.name : `${equipmentModel.name} · ${lod.toUpperCase()}`}</div>
                <div className="twin-panel__meta mt-1">
                  {!useSpecialFanViewer ? `${inspection?.keyNodeCount ?? 0}/${equipmentModel.semanticNodes.length} 语义节点` : partResolution?.fallbackToWholeModel
                    ? '整机高亮降级'
                    : partResolution?.matchedNodeNames.length
                      ? `定位 ${partResolution.matchedNodeNames.length} 个节点`
                      : '原始材质'}
                </div>
              </div>
            </div>

            <div className="twin-model-viewport">
              {useSpecialFanViewer ? <FanModelViewer
                key={actualModelUrl}
                ref={viewer}
                modelUrl={actualModelUrl}
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
              /> : <GeneralEquipmentViewer
                key={actualModelUrl}
                modelUrl={actualModelUrl}
                definition={equipmentModel}
                faultActive={genericFaultActive}
                casingDisplayMode={casingDisplayMode}
                guardVisible={couplingGuardVisible}
                selectedNode={selectedNode}
                onSelectNode={setSelectedNode}
                onInspection={setInspection}
              />}
            </div>

            <div className="twin-model-footer">
              <div className="twin-model-footer__summary">
                <Info className="mt-0.5 shrink-0" size={13} />
                <span>
                  {!inspection
                    ? '模型加载完成后将显示节点结构检查结果。'
                    : !useSpecialFanViewer
                      ? inspection.missingKeyNodes.length
                        ? `${equipmentModel.name}已加载，缺少 ${inspection.missingKeyNodes.length} 个声明节点；其余交互保持可用。`
                        : `${equipmentModel.name} ${lod.toUpperCase()} 的 ${inspection.keyNodeCount}/${inspection.requiredKeyNodeCount} 个声明节点验证通过。`
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
            {useSpecialFanViewer ? <><SensorStatusPanel scenario={scenario} />
            <DiagnosisPanel
              scenario={scenario}
              deviceId={equipment.deviceId}
              deviceName={equipment.deviceName}
              selectedNode={selectedNode}
              partResolution={partResolution}
            /></> : <>
              <section className="twin-panel"><div className="twin-panel__header"><h2 className="twin-panel__title">当前运行指标</h2><span className="twin-panel__meta">台账实时快照</span></div><div className="grid grid-cols-2 gap-2 p-3">{[['健康度', currentEquipment.healthScore], ['振动 mm/s', currentEquipment.vibration], ['温度 ℃', currentEquipment.temperature], ['电流 A', currentEquipment.current], ['压力 MPa', currentEquipment.pressure], ['转速 r/min', currentEquipment.speed]].map(([label, value]) => <div key={label} className="rounded border border-[var(--twin-border)] p-2"><small className="twin-muted block text-[9px]">{label}</small><strong className="twin-data mt-1 block text-sm">{value}</strong></div>)}</div></section>
              <section className="twin-panel"><div className="twin-panel__header"><h2 className="twin-panel__title">语义节点</h2><span className="twin-panel__meta">点击模型部件</span></div><div className="p-3 text-xs leading-5 text-[var(--twin-text-secondary)]">{selectedNode ? <><strong className="block text-[var(--twin-primary)]">{selectedNode.displayName}</strong><p className="twin-data mt-1 text-[10px]">{selectedNode.name}</p><p className="mt-2">节点类型：{selectedNode.type}；顶点数：{selectedNode.vertexCount ?? '—'}</p></> : <p>点击模型部件查看名称、材质和节点信息。模型测点以青色标记，风险定位以红色标记。</p>}<div className="mt-3 flex gap-2"><button className="twin-back-button" onClick={() => setCasingDisplayMode(casingDisplayMode === 'transparent' ? 'normal' : 'transparent')} disabled={!equipmentModel.supportsCasingTransparency}>机壳{casingDisplayMode === 'transparent' ? '恢复' : '透明'}</button><button className="twin-back-button" onClick={() => setCouplingGuardVisible((value) => !value)} disabled={!equipmentModel.supportsGuardToggle}>防护罩{couplingGuardVisible ? '隐藏' : '显示'}</button></div><button className="twin-order-button mt-3 w-full" onClick={() => navigate('/work-orders')}>进入维修工单</button></div></section>
            </>}
          </aside>
        </div>
        {useSpecialFanViewer && <TrendCharts scenario={scenario} />}
      </section>
    </div>
  );
}
