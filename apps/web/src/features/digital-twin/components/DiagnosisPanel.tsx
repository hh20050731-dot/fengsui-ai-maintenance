import { AlertTriangle, CheckCircle2, MousePointer2 } from 'lucide-react';
import clsx from 'clsx';
import type { FaultScenario, ModelNodeInfo, PartResolution } from '../digitalTwinTypes';
import { WorkOrderButton } from './WorkOrderButton';

export function DiagnosisPanel({ scenario, deviceId, deviceName, selectedNode, partResolution }: { scenario: FaultScenario; deviceId: string; deviceName: string; selectedNode: ModelNodeInfo | null; partResolution: PartResolution | null }) {
  const highRisk = scenario.risk === '高';
  return <section className="twin-panel twin-diagnosis">
    <div className="twin-panel__header"><h2 className="twin-panel__title">辅助研判</h2><span className="twin-panel__meta">规则演示</span></div>
    <div className="twin-diagnosis__body">
      <div className={clsx('twin-diagnosis__summary', highRisk && 'is-danger')}><AlertTriangle className="mt-1 shrink-0" size={15} /><p>{scenario.diagnosis}</p></div>
      <WorkOrderButton scenario={scenario} deviceId={deviceId} deviceName={deviceName} />
      <div className="twin-diagnosis__section"><div className="twin-diagnosis__label">检修建议</div><ul className="twin-diagnosis__list">{scenario.advice.map((item) => <li key={item}><CheckCircle2 className="mt-0.5 shrink-0 text-emerald-400" size={14} /><span>{item}</span></li>)}</ul><div className="mt-3 text-xs text-[var(--twin-text-secondary)]">建议时限：<strong className="text-[var(--twin-text)]">{scenario.deadline}</strong></div></div>
      <div className="twin-node-card"><div className="flex items-center gap-1.5 font-medium text-[var(--twin-text)]"><MousePointer2 size={13} />已选模型节点</div><div className="twin-data mt-1.5 break-all">{selectedNode?.displayName ?? '未选择（点击模型部件查看）'}</div>{selectedNode && <div className="twin-muted mt-1">{selectedNode.name} · {selectedNode.type}{selectedNode.vertexCount ? ` · ${selectedNode.vertexCount.toLocaleString()} 顶点` : ''}</div>}</div>
      {partResolution?.fallbackToWholeModel && scenario.targetPart && <div className="twin-fallback-note">当前模型节点缺少可识别的“{scenario.faultPart}”语义名称，故障效果已降级为整机高亮，未伪造独立部件。</div>}
      <p className="twin-disclaimer">本结果根据模拟数据和规则库生成，仅供比赛演示。是否停机及检修安排应由现场负责人结合安全规程决定。</p>
    </div>
  </section>;
}
