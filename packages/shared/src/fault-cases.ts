import type { CompetitionRiskLevel, IndicatorKey, OperatingCondition } from './types.js';

export interface FaultCasePhase {
  phase: '正常阶段' | '异常演变' | '首次预警' | '维修反馈';
  description: string;
  healthScore: number;
  metrics: Partial<Record<IndicatorKey | 'flow', number>>;
}

export interface FaultCase {
  caseId: string;
  title: string;
  deviceId: string;
  deviceType: string;
  faultType: string;
  operatingCondition: OperatingCondition;
  phases: FaultCasePhase[];
  abnormalIndicators: string[];
  riskLevel: CompetitionRiskLevel;
  riskContributions: Array<{ indicator: string; score: number; evidence: string }>;
  possibleCauses: string[];
  recommendedActions: string[];
  recommendedDeadline: string;
  requiredParts: string[];
  locatorNode: string;
  agentTools: string[];
  workOrderTemplate: string;
  maintenanceFeedback: string;
  knowledgeOutcome: string;
  dataBoundary: string;
}

const boundary = '比赛演示规则案例，参数变化为可复现模拟数据，不代表真实设备诊断结论。';

export const faultCases: FaultCase[] = [
  {
    caseId: 'CASE-IDF-BEARING-OVERHEAT', title: '引风机轴承过热', deviceId: 'IDF-001', deviceType: '离心式引风机', faultType: '轴承过热', operatingCondition: '高负荷稳定运行',
    phases: [
      { phase: '正常阶段', description: '高负荷下振动与温度稳定', healthScore: 92, metrics: { vibration: 4.2, temperature: 72 } },
      { phase: '异常演变', description: '连续6小时振动和温度同步上升', healthScore: 76, metrics: { vibration: 5.8, temperature: 81 } },
      { phase: '首次预警', description: '持续时间与多参数融合触发二级预警', healthScore: 68, metrics: { vibration: 6.8, temperature: 86 } },
      { phase: '维修反馈', description: '润滑与轴承检查后指标恢复', healthScore: 92, metrics: { vibration: 3.1, temperature: 68 } },
    ],
    abnormalIndicators: ['轴承振动', '轴承温度'], riskLevel: '预警',
    riskContributions: [{ indicator: 'vibration', score: 14.8, evidence: '4.2→6.8 mm/s，持续6小时上升' }, { indicator: 'temperature', score: 8.6, evidence: '72→86℃，高负荷基准上方持续偏离' }],
    possibleCauses: ['轴承磨损', '润滑不足或油品劣化', '联轴器不对中'], recommendedActions: ['检查润滑油状态', '测量轴承间隙', '检查联轴器对中', '复核地脚螺栓'], recommendedDeadline: '24小时内', requiredParts: ['风机轴承', '通用润滑油'], locatorNode: 'bearing_drive_locator',
    agentTools: ['getEquipmentStatus', 'getTelemetryTrend', 'searchKnowledgeBase', 'checkSparePartInventory', 'generateDiagnosis', 'createWorkOrder', 'notifyFeishu'], workOrderTemplate: '驱动端轴承温升检查', maintenanceFeedback: '健康度68→92，预警关闭，轴承库存6→5', knowledgeOutcome: '形成轴承温升维修闭环候选案例', dataBoundary: boundary,
  },
  {
    caseId: 'CASE-IDF-IMPELLER', title: '引风机叶轮不平衡', deviceId: 'IDF-002', deviceType: '离心式引风机', faultType: '叶轮不平衡', operatingCondition: '稳定运行',
    phases: [{ phase: '正常阶段', description: '径向振动稳定', healthScore: 94, metrics: { vibration: 2.8 } }, { phase: '异常演变', description: '振动基频分量逐步增大', healthScore: 82, metrics: { vibration: 4.7 } }, { phase: '首次预警', description: '振动持续越过工况基准', healthScore: 71, metrics: { vibration: 6.1 } }, { phase: '维修反馈', description: '清灰和平衡校正后恢复', healthScore: 93, metrics: { vibration: 2.9 } }],
    abnormalIndicators: ['振动'], riskLevel: '预警', riskContributions: [{ indicator: 'vibration', score: 23, evidence: '稳定工况振动2.8→6.1 mm/s' }], possibleCauses: ['叶轮积灰', '叶轮磨损', '配重脱落'], recommendedActions: ['停机条件允许时检查叶轮积灰', '进行动平衡复核'], recommendedDeadline: '48小时内', requiredParts: ['振动传感器'], locatorNode: 'impeller_group', agentTools: ['getTelemetryTrend', 'searchKnowledgeBase', 'generateDiagnosis'], workOrderTemplate: '叶轮清灰与动平衡检查', maintenanceFeedback: '清灰后振动恢复至2.9 mm/s', knowledgeOutcome: '形成叶轮不平衡案例', dataBoundary: boundary,
  },
  {
    caseId: 'CASE-IDF-COUPLING', title: '引风机联轴器不对中', deviceId: 'IDF-001', deviceType: '离心式引风机', faultType: '联轴器不对中', operatingCondition: '稳定运行',
    phases: [{ phase: '正常阶段', description: '轴向振动稳定', healthScore: 93, metrics: { vibration: 3.0, temperature: 69 } }, { phase: '异常演变', description: '轴向振动与轴承温度共同抬升', healthScore: 80, metrics: { vibration: 4.9, temperature: 77 } }, { phase: '首次预警', description: '多参数融合触发预警', healthScore: 70, metrics: { vibration: 6.0, temperature: 83 } }, { phase: '维修反馈', description: '激光对中后恢复', healthScore: 91, metrics: { vibration: 3.2, temperature: 70 } }],
    abnormalIndicators: ['轴向振动', '轴承温度'], riskLevel: '预警', riskContributions: [{ indicator: 'vibration', score: 18, evidence: '轴向振动持续上升' }, { indicator: 'temperature', score: 8, evidence: '轴承温升与振动同步' }], possibleCauses: ['安装偏差', '基础沉降', '热膨胀补偿不足'], recommendedActions: ['激光对中', '检查软脚与基础紧固'], recommendedDeadline: '24小时内', requiredParts: ['联轴器'], locatorNode: 'coupling_element', agentTools: ['getTelemetryTrend', 'getMaintenanceHistory', 'searchKnowledgeBase'], workOrderTemplate: '联轴器对中复核', maintenanceFeedback: '重新对中后轴向振动恢复', knowledgeOutcome: '形成联轴器不对中案例', dataBoundary: boundary,
  },
  ...[
    ['CASE-FWP-CAVITATION', '给水泵汽蚀', 'FWP-001', '给水泵', '汽蚀', ['入口压力', '振动'], ['入口液位不足', '入口滤网堵塞'], ['检查入口液位和滤网', '复核汽蚀余量'], '8小时内', ['压力传感器'], 'impeller_locator'],
    ['CASE-FWP-SEAL', '给水泵机械密封泄漏', 'FWP-002', '给水泵', '机械密封泄漏', ['泄漏量', '压力'], ['密封面磨损', '冲洗水异常'], ['检查密封冲洗水', '更换机械密封'], '12小时内', ['机械密封件'], 'seal_locator'],
    ['CASE-CWP-BLOCK', '循环水泵叶轮堵塞', 'CWP-001', '循环水泵', '叶轮堵塞', ['电流', '流量'], ['杂物进入叶轮', '入口滤网破损'], ['隔离后清理叶轮', '检查入口滤网'], '12小时内', ['机械密封件'], 'impeller_locator'],
    ['CASE-CWP-PRESSURE', '循环水泵出口压力下降', 'CWP-002', '循环水泵', '出口压力下降', ['压力', '流量'], ['入口堵塞', '叶轮磨损', '系统泄漏'], ['检查入口与阀位', '复核叶轮磨损'], '24小时内', ['压力传感器'], 'outlet_locator'],
    ['CASE-GRB-LUBE', '炉排减速机润滑不足', 'GRB-001', '炉排减速机', '润滑不足', ['箱体温度', '振动'], ['油位不足', '油品劣化'], ['检查油位油质', '按说明书补充或更换润滑油'], '8小时内', ['通用润滑油'], 'gearbox_bearing_locator'],
    ['CASE-ACP-PRESSURE', '空压机排气压力异常', 'ACP-001', '螺杆空压机', '排气压力异常', ['压力', '电流'], ['进气滤芯堵塞', '最小压力阀异常'], ['检查滤芯和阀件', '核对负荷控制'], '24小时内', ['压力传感器'], 'outlet_locator'],
    ['CASE-LCP-OVERLOAD', '渗滤液泵堵塞或过载', 'LCP-001', '渗滤液泵', '堵塞或过载', ['电流', '压力'], ['泵体堵塞', '介质粘度升高'], ['执行隔离并清理泵体', '检查机械密封'], '立即安排', ['机械密封件'], 'impeller_locator'],
  ].map(([caseId, title, deviceId, deviceType, faultType, indicators, causes, actions, deadline, parts, locatorNode]) => ({
    caseId: caseId as string, title: title as string, deviceId: deviceId as string, deviceType: deviceType as string, faultType: faultType as string, operatingCondition: '稳定运行' as const,
    phases: [{ phase: '正常阶段' as const, description: '指标位于工况基准范围', healthScore: 93, metrics: { vibration: 2.7, temperature: 66, current: 58, pressure: 0.72 } }, { phase: '异常演变' as const, description: '关键指标持续偏离基准', healthScore: 79, metrics: { vibration: 4.6, temperature: 76, current: 73, pressure: 0.55 } }, { phase: '首次预警' as const, description: '持续时间和多参数融合触发预警', healthScore: 69, metrics: { vibration: 5.8, temperature: 82, current: 86, pressure: 0.43 } }, { phase: '维修反馈' as const, description: '现场处置后指标恢复', healthScore: 91, metrics: { vibration: 3.0, temperature: 68, current: 61, pressure: 0.69 } }],
    abnormalIndicators: indicators as string[], riskLevel: '预警' as const, riskContributions: (indicators as string[]).map((indicator, index) => ({ indicator, score: 16 - index * 4, evidence: `${indicator}持续偏离当前工况基准` })), possibleCauses: causes as string[], recommendedActions: actions as string[], recommendedDeadline: deadline as string, requiredParts: parts as string[], locatorNode: locatorNode as string,
    agentTools: ['getEquipmentStatus', 'getTelemetryTrend', 'searchKnowledgeBase', 'checkSparePartInventory', 'generateDiagnosis'], workOrderTemplate: `${title as string}检查与处置`, maintenanceFeedback: '维修后指标回归工况基准范围', knowledgeOutcome: `形成${title as string}知识候选案例`, dataBoundary: boundary,
  })),
];

export function getFaultCase(caseId: string): FaultCase | undefined {
  return faultCases.find((item) => item.caseId === caseId);
}
