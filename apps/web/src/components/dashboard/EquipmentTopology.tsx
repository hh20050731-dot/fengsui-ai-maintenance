import { Box, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Equipment, RiskLevel } from '@fengsui/shared';
import { StatusNode } from '../industrial';

const mainNodes = [
  { id: 'LTP-001', stage: '垃圾仓', x: 5, y: 43 },
  { id: 'FDR-001', stage: '给料机', x: 20, y: 43 },
  { id: 'GRB-001', stage: '焚烧炉', x: 35, y: 43 },
  { id: 'TUR-001', stage: '余热发电', x: 50, y: 43 },
  { id: 'GEN-001', stage: '电力输出', x: 64, y: 43 },
  { id: 'IDF-001', stage: '引风机', x: 79, y: 43 },
] as const;

const branchNodes = [
  { id: 'FDR-002', x: 20, y: 78 },
  { id: 'GRB-002', x: 35, y: 78 },
  { id: 'CWP-001', x: 50, y: 78 },
  { id: 'CWP-002', x: 61, y: 78 },
  { id: 'ACP-001', x: 72, y: 78 },
  { id: 'IDF-002', x: 86, y: 78 },
] as const;

const severity = (risk: RiskLevel) => risk === '高风险' ? 4 : risk === '二级预警' ? 3 : risk === '关注' ? 2 : risk === '离线' ? 0 : 1;
const aggregateRisk = (items: Equipment[]): RiskLevel => items.slice().sort((a, b) => severity(b.riskLevel) - severity(a.riskLevel))[0]?.riskLevel ?? '离线';

export function EquipmentTopology({ equipment }: { equipment: Equipment[] }) {
  const navigate = useNavigate();
  const byId = new Map(equipment.map((item) => [item.deviceId, item]));
  const plantRisk = aggregateRisk(equipment);

  const renderNode = ({ id, stage, x, y }: { id: string; stage?: string; x: number; y: number }) => {
    const item = byId.get(id);
    if (!item) return null;
    return <div key={id} className="topology-node" style={{ left: `${x}%`, top: `${y}%` }}>
      <button className="topology-node__button" onClick={() => navigate(`/equipment/${id}`)} title={`查看${item.deviceName}详情`}>
        <span className="topology-node__signal"><StatusNode status={item.riskLevel} size="lg" pulse={item.riskLevel === '高风险'} />{item.riskLevel === '高风险' && <i className="industrial-scan-ring" />}</span>
        {stage && <small>{stage}</small>}
        <strong>{item.deviceName}</strong>
        <span className="industrial-data">{item.deviceId} · {item.healthScore}</span>
      </button>
      {id === 'IDF-001' && <button className="topology-node__twin" onClick={() => navigate('/digital-twin?equipment=IDF-01')}><Box size={12} />进入3D</button>}
    </div>;
  };

  return <div className="equipment-topology" data-testid="equipment-topology">
    <div className="equipment-topology__legend">
      <span>工艺主线</span><i /><b>垃圾仓</b><ChevronRight size={12} /><b>给料</b><ChevronRight size={12} /><b>焚烧</b><ChevronRight size={12} /><b>余热发电</b><ChevronRight size={12} /><b>烟气净化</b><ChevronRight size={12} /><b>引风排放</b>
    </div>
    <svg className="equipment-topology__lines" viewBox="0 0 1000 360" preserveAspectRatio="none" aria-hidden="true">
      <path d="M50 155 H840 Q900 155 950 155" className="topology-line topology-line--main" />
      <path d="M200 155 V278 M350 155 V278 M500 155 V278 H720 V155 M640 155 V278 M790 155 V278 H860" className="topology-line topology-line--branch" />
      <path d="M50 155 H950" className="topology-line topology-line--flow industrial-flow-line" />
    </svg>
    <div className="equipment-topology__terminal" style={{ left: '95%', top: '43%' }}><StatusNode status={plantRisk} size="md" /><strong>烟囱排放端</strong><small>状态随设备链路汇总</small></div>
    {mainNodes.map(renderNode)}
    {branchNodes.map(renderNode)}
    <div className="equipment-topology__caption">节点健康度、风险与运行状态均来自当前设备台账；工艺阶段仅用于展示设备链路关系。</div>
  </div>;
}
