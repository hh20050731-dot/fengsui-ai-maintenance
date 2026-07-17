import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Box, FileBox, Info } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Equipment } from '@fengsui/shared';
import { DemoDisclaimer, ErrorState, Loading } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { DiagnosisPanel } from '../features/digital-twin/components/DiagnosisPanel';
import { EquipmentList } from '../features/digital-twin/components/EquipmentList';
import { FanModelViewer } from '../features/digital-twin/components/FanModelViewer';
import { FaultScenarioPanel } from '../features/digital-twin/components/FaultScenarioPanel';
import { SensorStatusPanel } from '../features/digital-twin/components/SensorStatusPanel';
import { TrendCharts } from '../features/digital-twin/components/TrendCharts';
import { resolveDigitalTwinEquipment } from '../features/digital-twin/equipmentConfig';
import { faultScenarios, isFaultScenarioId } from '../features/digital-twin/faultScenarios';
import type { FanModelViewerHandle, FaultScenarioId, ModelInspection, ModelNodeInfo, PartResolution } from '../features/digital-twin/digitalTwinTypes';
import { api } from '../services/api';

export function DigitalTwinPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const equipment = useMemo(() => resolveDigitalTwinEquipment(params.get('equipment')), [params]);
  const faultValue = params.get('fault');
  const scenarioId: FaultScenarioId = isFaultScenarioId(faultValue) ? faultValue : 'normal';
  const scenario = faultScenarios[scenarioId];
  const viewer = useRef<FanModelViewerHandle>(null);
  const [selectedNode, setSelectedNode] = useState<ModelNodeInfo | null>(null);
  const [inspection, setInspection] = useState<ModelInspection | null>(null);
  const [partResolution, setPartResolution] = useState<PartResolution | null>(null);
  const equipmentQuery = useQuery({ queryKey: ['equipment', equipment.deviceId], queryFn: () => api<Equipment>(`/equipment/${equipment.deviceId}`) });

  const changeScenario = (next: FaultScenarioId) => {
    const nextParams = new URLSearchParams(params);
    nextParams.set('equipment', equipment.queryId);
    nextParams.set('fault', next);
    setParams(nextParams);
    setSelectedNode(null);
  };

  if (equipmentQuery.isLoading) return <Loading label="正在读取引风机台账…" />;
  if (equipmentQuery.isError) return <ErrorState error={equipmentQuery.error} retry={() => equipmentQuery.refetch()} />;

  return <div>
    <PageHeader title="引风机数字孪生" description={`${equipment.deviceName} · ${equipment.queryId} · 三维状态与故障场景联动演示`} actions={<button className="btn-secondary" onClick={() => navigate(`/equipment/${equipment.deviceId}`)}><ArrowLeft size={15} />返回设备详情</button>} />
    <DemoDisclaimer compact />
    <div className="mt-4 grid items-start gap-4 xl:grid-cols-[220px_minmax(0,1fr)_340px]">
      <aside><EquipmentList equipment={equipment} /><FaultScenarioPanel value={scenarioId} onChange={changeScenario} /></aside>
      <section className="panel min-w-0 overflow-hidden">
        <div className="panel-header gap-3"><div><h2 className="panel-title">三维模型</h2><div className="mt-1 flex items-center gap-1.5 text-[11px] text-[#8F959E]"><FileBox size={12} /><span className="font-mono">{equipment.modelUrl}</span></div></div><div className="text-right"><div className="text-xs font-medium text-[#3A3F47]">{scenario.name}</div><div className="mt-1 text-[11px] text-[#8F959E]">{partResolution?.fallbackToWholeModel ? '整机高亮降级' : partResolution?.matchedNodeNames.length ? `定位 ${partResolution.matchedNodeNames.length} 个节点` : '原始材质'}</div></div></div>
        <FanModelViewer ref={viewer} modelUrl={equipment.modelUrl} scenario={scenario} selectedNode={selectedNode} onSelectNode={setSelectedNode} onInspection={setInspection} onPartResolution={setPartResolution} />
        <div className="grid gap-2 border-t border-[#E5E6EB] bg-white px-4 py-3 text-xs text-[#646A73] sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="flex items-start gap-2"><Info className="mt-0.5 shrink-0 text-[#8F959E]" size={14} /><span>{inspection ? inspection.meshCount <= 1 ? '当前模型未拆分为独立部件，仅支持整机点击、高亮和故障效果。' : `模型包含 ${inspection.meshCount} 个独立 Mesh；节点命名以 SHELL 为主，点击可查看真实节点，语义部件无法匹配时自动使用整机效果。` : '模型加载完成后将显示节点结构检查结果。'}</span></div>
          {inspection && <div className="flex items-center gap-2 whitespace-nowrap font-mono text-[11px] text-[#8F959E]"><Box size={13} />{inspection.nodeCount} nodes / {inspection.meshCount} meshes</div>}
        </div>
      </section>
      <aside><SensorStatusPanel scenario={scenario} /><DiagnosisPanel scenario={scenario} deviceId={equipment.deviceId} deviceName={equipment.deviceName} selectedNode={selectedNode} partResolution={partResolution} /></aside>
    </div>
    <TrendCharts scenario={scenario} />
  </div>;
}
