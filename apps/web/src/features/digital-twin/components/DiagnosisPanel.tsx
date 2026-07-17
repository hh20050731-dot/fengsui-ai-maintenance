import { AlertTriangle, CheckCircle2, MousePointer2 } from 'lucide-react';
import type { FaultScenario, ModelNodeInfo, PartResolution } from '../digitalTwinTypes';
import { WorkOrderButton } from './WorkOrderButton';

export function DiagnosisPanel({ scenario, deviceId, deviceName, selectedNode, partResolution }: { scenario: FaultScenario; deviceId: string; deviceName: string; selectedNode: ModelNodeInfo | null; partResolution: PartResolution | null }) {
  return <section className="panel mt-4 overflow-hidden">
    <div className="panel-header"><h2 className="panel-title">辅助研判</h2><span className="text-xs text-[#8F959E]">规则演示</span></div>
    <div className="p-4">
      <div className="flex items-start gap-2 text-sm leading-6 text-[#3A3F47]"><AlertTriangle className="mt-1 shrink-0 text-orange-600" size={15} /><p>{scenario.diagnosis}</p></div>
      <div className="mt-4 border-t border-[#E5E6EB] pt-4"><div className="text-xs font-medium text-[#646A73]">检修建议</div><ul className="mt-2 space-y-2 text-sm leading-5 text-[#3A3F47]">{scenario.advice.map((item) => <li key={item} className="flex gap-2"><CheckCircle2 className="mt-0.5 shrink-0 text-[#7FA58A]" size={14} /><span>{item}</span></li>)}</ul><div className="mt-3 text-xs text-[#646A73]">建议时限：<strong className="text-[#3A3F47]">{scenario.deadline}</strong></div></div>
      <div className="mt-4 rounded border border-[#E5E6EB] bg-[#FAFAFA] p-3 text-xs text-[#646A73]"><div className="flex items-center gap-1.5 font-medium text-[#3A3F47]"><MousePointer2 size={13} />已选模型节点</div><div className="mt-1.5 break-all font-mono">{selectedNode?.name ?? '未选择（点击模型部件查看）'}</div>{selectedNode && <div className="mt-1 text-[#8F959E]">{selectedNode.type}{selectedNode.vertexCount ? ` · ${selectedNode.vertexCount.toLocaleString()} 顶点` : ''}</div>}</div>
      {partResolution?.fallbackToWholeModel && scenario.targetPart && <div className="mt-3 rounded border border-orange-200 bg-orange-50 px-3 py-2 text-xs leading-5 text-orange-800">当前模型节点缺少可识别的“{scenario.faultPart}”语义名称，故障效果已降级为整机高亮，未伪造独立部件。</div>}
      <WorkOrderButton scenario={scenario} deviceId={deviceId} deviceName={deviceName} />
      <p className="mt-3 text-[11px] leading-5 text-[#8F959E]">本结果根据模拟数据和规则库生成，仅供比赛演示。是否停机及检修安排应由现场负责人结合安全规程决定。</p>
    </div>
  </section>;
}
