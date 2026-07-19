import type {
  AiDiagnosis,
  Alert,
  DiagnosisIntent,
  Equipment,
  KnowledgeEntry,
  SparePart,
  TelemetryPoint,
  WorkOrder,
} from './types.js';
import { getDiagnosisIntentRoute } from './intent-router.js';

export interface RuleDiagnosisContext {
  question: string;
  intent: DiagnosisIntent;
  selectedDeviceId?: string;
  equipment?: Equipment[];
  device?: Equipment;
  telemetry?: TelemetryPoint[];
  alerts?: Alert[];
  workOrders?: WorkOrder[];
  spareParts?: SparePart[];
  knowledge?: KnowledgeEntry[];
  providerName?: string;
}

const riskWeight: Record<Equipment['riskLevel'], number> = {
  离线: -1,
  健康: 0,
  关注: 1,
  二级预警: 2,
  高风险: 3,
};

const riskNotice = '本结果根据模拟数据和规则模型生成，仅用于比赛方案展示。实际生产应用需结合企业真实数据、设备说明书、安全规程和专业人员判断。是否停机应由现场负责人结合安全规程决定。';

const unique = (values: string[], limit = 6) => [...new Set(values.filter(Boolean))].slice(0, limit);

export function recognizeDiagnosisIntent(question: string): DiagnosisIntent {
  return getDiagnosisIntentRoute(question).intent;
}

export function resolveDiagnosisDevice(question: string, equipment: Equipment[], selectedDeviceId?: string) {
  const normalized = question.replace(/[\s？?！!，,。]/g, '').toLowerCase();
  const explicit = equipment.find((item) =>
    normalized.includes(item.deviceId.toLowerCase())
    || normalized.includes(item.deviceName.replace(/\s/g, '').toLowerCase()),
  );
  if (explicit) return explicit;
  return selectedDeviceId ? equipment.find((item) => item.deviceId === selectedDeviceId) : undefined;
}

function sortByRisk(items: Equipment[]) {
  return items.slice().sort((left, right) =>
    riskWeight[right.riskLevel] - riskWeight[left.riskLevel]
    || left.healthScore - right.healthScore,
  );
}

function answerBase(context: RuleDiagnosisContext, patch: Omit<AiDiagnosis, 'question' | 'intent' | 'generatedAt' | 'provider' | 'riskNotice'>): AiDiagnosis {
  return {
    ...patch,
    question: context.question,
    intent: context.intent,
    generatedAt: new Date().toISOString(),
    provider: context.providerName ?? 'RuleBasedDiagnosisProvider',
    riskNotice,
  };
}

function valueWithUnit(value: number, unit: string, digits: number) {
  const formatted = value.toFixed(digits);
  return unit === '℃' ? `${formatted}℃` : `${formatted} ${unit}`;
}

/** 根据差值生成正确的上升、下降或持平描述，不预设趋势方向。 */
export function formatIndicatorTrend(label: string, start: number, end: number, unit: string, digits: number) {
  const delta = end - start;
  const tolerance = 10 ** (-digits) / 2;
  if (Math.abs(delta) < tolerance) {
    return `${label}由 ${valueWithUnit(start, unit, digits)} 至 ${valueWithUnit(end, unit, digits)}（基本稳定）`;
  }
  const direction = delta > 0 ? '上升' : '下降';
  return `${label}由 ${valueWithUnit(start, unit, digits)} ${direction}至 ${valueWithUnit(end, unit, digits)}（${direction} ${valueWithUnit(Math.abs(delta), unit, digits)}）`;
}

function startOfTrendWindow(points: TelemetryPoint[]) {
  const sorted = points.slice().sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
  const last = sorted.at(-1);
  if (!last) return undefined;
  const target = Date.parse(last.timestamp) - 6 * 3_600_000;
  return sorted.reduce((closest, point) =>
    Math.abs(Date.parse(point.timestamp) - target) < Math.abs(Date.parse(closest.timestamp) - target) ? point : closest,
  );
}

function abnormalIndicators(device: Equipment, alerts: Alert[]) {
  const current = [
    ...(device.vibration >= 5.2 ? ['轴承振动'] : []),
    ...(device.temperature >= 78 ? ['轴承温度'] : []),
    ...(device.current >= 108 ? ['电流'] : []),
    ...(device.pressure > 0 && device.pressure < 0.35 ? ['压力'] : []),
  ];
  const activeAlert = alerts.find((item) => item.deviceId === device.deviceId && !['已关闭', '误报'].includes(item.alertStatus));
  return unique(current.length ? current : (activeAlert?.abnormalIndicators ?? []));
}

function relevantKnowledge(device: Equipment, indicators: string[], knowledge: KnowledgeEntry[]) {
  const rotating = /风机|泵|汽轮机|发电机|减速机|空压机/.test(`${device.deviceName}${device.deviceType}`);
  return knowledge.filter((entry) =>
    entry.deviceType === '通用'
    || device.deviceType.includes(entry.deviceType)
    || (entry.deviceType === '旋转设备' && rotating)
    || entry.abnormalIndicators.some((indicator) => indicators.includes(indicator)),
  );
}

function deviceDiagnosis(context: RuleDiagnosisContext) {
  const device = context.device;
  if (!device) throw new Error('设备类问题缺少可研判设备');
  const alerts = context.alerts ?? [];
  const indicators = abnormalIndicators(device, alerts);
  const relevant = relevantKnowledge(device, indicators, context.knowledge ?? []);
  const start = startOfTrendWindow(context.telemetry ?? []);
  const evidence = [
    `过去6小时${formatIndicatorTrend('振动值', start?.vibration ?? device.vibration, device.vibration, 'mm/s', 1)}`,
    `过去6小时${formatIndicatorTrend('轴承温度', start?.temperature ?? device.temperature, device.temperature, '℃', 0)}`,
    `当前处于${device.operatingCondition}工况，运行状态为${device.runningStatus}，健康度为 ${device.healthScore}`,
  ];
  const activeAlert = alerts.find((item) => item.deviceId === device.deviceId && !['已关闭', '误报'].includes(item.alertStatus));
  const causes = unique([
    ...(activeAlert?.suspectedCause ? [activeAlert.suspectedCause] : []),
    ...relevant.flatMap((entry) => entry.possibleCauses),
  ], 4);
  const inspections = unique([
    ...(activeAlert?.maintenanceSuggestion ?? []),
    ...relevant.flatMap((entry) => entry.inspectionSteps),
  ], 6);
  const relatedParts = unique(relevant.flatMap((entry) => entry.relatedSpareParts), 4);
  const riskJudgment = context.intent === 'equipment_status'
    ? `${device.deviceName}当前状态为${device.runningStatus}，处于${device.operatingCondition}工况，健康度 ${device.healthScore}，风险等级为${device.riskLevel}。`
    : context.intent === 'abnormal_metrics'
      ? `${device.deviceName}当前异常指标为${indicators.length ? indicators.join('、') : '未发现明显越限'}；以下结论来自工况阈值、趋势和当前预警的联合核查。`
    : context.intent === 'diagnosis_reason'
      ? `${device.deviceName}的轴承温升风险判断来自温度、振动、工况和规则库的联合匹配，不代表轴承已经损坏。`
      : `${device.deviceName}当前风险等级为${device.riskLevel}，健康度 ${device.healthScore}；建议结合趋势和现场检查确认风险。`;
  return answerBase(context, {
    deviceId: device.deviceId,
    riskJudgment,
    operatingCondition: device.operatingCondition,
    abnormalIndicators: indicators.length ? indicators : ['当前未发现明显越限指标'],
    trendEvidence: evidence,
    suspectedCauses: causes.length ? causes : ['暂未匹配到明确故障原因，建议复核测点和现场状态'],
    inspectionItems: inspections.length ? inspections : ['复核测点', '对照设备说明书检查现场状态'],
    suggestedDeadline: device.riskLevel === '高风险' ? '建议立即由现场负责人评估处置' : device.riskLevel === '二级预警' ? '24小时内' : device.riskLevel === '关注' ? '72小时内' : '按计划点检',
    relatedSpareParts: relatedParts,
    confidence: activeAlert?.confidence ?? (indicators.length ? 0.78 : 0.68),
  });
}

function highestRiskDiagnosis(context: RuleDiagnosisContext) {
  const ranked = sortByRisk(context.equipment ?? []);
  const device = ranked[0];
  if (!device) throw new Error('没有可用于风险排序的设备数据');
  return answerBase(context, {
    deviceId: device.deviceId,
    riskJudgment: `当前风险最高的是${device.deviceName}（${device.deviceId}），健康度 ${device.healthScore}，风险等级为${device.riskLevel}。`,
    operatingCondition: device.operatingCondition,
    abnormalIndicators: [`风险等级：${device.riskLevel}`, `运行状态：${device.runningStatus}`],
    trendEvidence: [`已按风险等级优先、健康度从低到高对 ${ranked.length} 台设备排序`, `第二优先设备为${ranked[1]?.deviceName ?? '无'}，健康度 ${ranked[1]?.healthScore ?? '—'}`],
    suspectedCauses: ['该结果是设备风险排序，不等同于故障定性'],
    inspectionItems: [`优先核查${device.deviceName}当前检修或隔离状态`, '查看关联预警与工单处理进度'],
    suggestedDeadline: device.riskLevel === '高风险' ? '立即核查处置状态' : '24小时内',
    relatedSpareParts: [],
    confidence: 0.94,
  });
}

function highRiskDiagnosis(context: RuleDiagnosisContext) {
  const rows = sortByRisk(context.equipment ?? []).filter((item) => item.riskLevel === '高风险');
  return answerBase(context, {
    deviceId: rows[0]?.deviceId ?? 'ALL',
    riskJudgment: rows.length
      ? `当前共有 ${rows.length} 台高风险设备：${rows.map((item) => `${item.deviceName}（健康度${item.healthScore}）`).join('、')}。`
      : '当前没有风险等级为“高风险”的设备。',
    operatingCondition: '全站风险盘点',
    abnormalIndicators: rows.map((item) => `${item.deviceName}：${item.runningStatus}`),
    trendEvidence: rows.map((item) => `${item.deviceName}位于${item.systemArea}，负责人${item.responsiblePerson}`),
    suspectedCauses: ['高风险清单只反映当前数据状态，不直接判定具体故障'],
    inspectionItems: rows.length ? rows.map((item) => `核查${item.deviceName}的安全隔离、检修和工单状态`) : ['维持当前巡检计划'],
    suggestedDeadline: rows.length ? '立即核查高风险设备处置状态' : '按计划巡检',
    relatedSpareParts: [],
    confidence: 0.96,
  });
}

function pendingOrdersDiagnosis(context: RuleDiagnosisContext) {
  const pending = (context.workOrders ?? [])
    .filter((item) => !['已完成', '已取消'].includes(item.status))
    .sort((left, right) => Date.parse(left.deadline) - Date.parse(right.deadline));
  const overdue = pending.filter((item) => Date.parse(item.deadline) < Date.now());
  return answerBase(context, {
    deviceId: 'ALL',
    riskJudgment: `当前共有 ${pending.length} 张待处理工单，其中 ${overdue.length} 张已超过计划时限。`,
    operatingCondition: '维修工单状态汇总',
    abnormalIndicators: unique(pending.map((item) => item.status)),
    trendEvidence: pending.slice(0, 6).map((item) => `${item.workOrderNo} · ${item.deviceName} · ${item.status} · 负责人${item.assignee}`),
    suspectedCauses: overdue.length ? ['存在工单超期或处理进度未及时闭环的风险'] : ['当前未发现工单超期'],
    inspectionItems: pending.slice(0, 4).map((item) => `跟进${item.workOrderNo}（${item.deviceName}）`),
    suggestedDeadline: overdue.length ? '立即跟进超期工单' : '按工单计划时限处理',
    relatedSpareParts: unique(pending.flatMap((item) => item.requiredSpareParts.map((part) => part.partName))),
    confidence: 0.98,
  });
}

function sparePartsDiagnosis(context: RuleDiagnosisContext) {
  const parts = context.spareParts ?? [];
  const shortage = parts.filter((part) => part.stockStatus !== '充足');
  const outOfStock = shortage.filter((part) => part.stockStatus === '缺货');
  const fanBearing = parts.find((part) => part.partName === '风机轴承');
  const lubricant = parts.find((part) => part.partName === '通用润滑油');
  const fanReady = Boolean(fanBearing && fanBearing.currentStock >= 1 && lubricant && lubricant.currentStock >= 1);
  return answerBase(context, {
    deviceId: 'ALL',
    riskJudgment: `${fanReady ? '1号引风机一次轴承检修所需的轴承和润滑油当前可满足。' : '1号引风机轴承检修备件当前不完全满足。'} 全库仍有 ${shortage.length} 类低库存或缺货备件。`,
    operatingCondition: '备件库存核查',
    abnormalIndicators: shortage.length ? shortage.map((part) => `${part.partName}：${part.stockStatus}`) : ['全部备件库存充足'],
    trendEvidence: [
      `风机轴承库存 ${fanBearing?.currentStock ?? 0}${fanBearing?.unit ?? '套'}，安全库存 ${fanBearing?.safeStock ?? 0}${fanBearing?.unit ?? '套'}`,
      `通用润滑油库存 ${lubricant?.currentStock ?? 0}${lubricant?.unit ?? '桶'}，安全库存 ${lubricant?.safeStock ?? 0}${lubricant?.unit ?? '桶'}`,
      `缺货备件：${outOfStock.map((part) => part.partName).join('、') || '无'}`,
    ],
    suspectedCauses: shortage.length ? ['部分备件库存已达到或低于安全库存'] : ['当前没有库存短缺'],
    inspectionItems: shortage.map((part) => `复核${part.partName}补货计划和在途数量`).slice(0, 6),
    suggestedDeadline: outOfStock.length ? '立即补充缺货备件' : shortage.length ? '本周内安排补库' : '按月度计划盘点',
    relatedSpareParts: unique(shortage.map((part) => part.partName)),
    confidence: 0.97,
  });
}

function maintenancePriorityDiagnosis(context: RuleDiagnosisContext) {
  const orders = context.workOrders ?? [];
  const alerts = context.alerts ?? [];
  const ranked = (context.equipment ?? []).slice().sort((left, right) => {
    const score = (item: Equipment) => riskWeight[item.riskLevel] * 100 + (100 - item.healthScore)
      + alerts.filter((alert) => alert.deviceId === item.deviceId && !['已关闭', '误报'].includes(alert.alertStatus)).length * 10
      + orders.filter((order) => order.deviceId === item.deviceId && !['已完成', '已取消'].includes(order.status)).length * 5;
    return score(right) - score(left);
  });
  const device = ranked[0];
  if (!device) throw new Error('没有可用于检修排序的设备数据');
  const order = orders.find((item) => item.deviceId === device.deviceId && !['已完成', '已取消'].includes(item.status));
  const alert = alerts.find((item) => item.deviceId === device.deviceId && !['已关闭', '误报'].includes(item.alertStatus));
  return answerBase(context, {
    deviceId: device.deviceId,
    riskJudgment: `建议优先保障${device.deviceName}的检修与闭环，当前健康度 ${device.healthScore}，风险等级${device.riskLevel}${order ? `，关联工单${order.workOrderNo}处于${order.status}` : ''}。`,
    operatingCondition: device.operatingCondition,
    abnormalIndicators: alert?.abnormalIndicators ?? [`风险等级：${device.riskLevel}`],
    trendEvidence: [`优先级综合考虑风险等级、健康度、未关闭预警和待处理工单`, `${device.deviceName}当前运行状态为${device.runningStatus}`],
    suspectedCauses: alert ? [alert.suspectedCause] : ['优先级来自风险排序，具体原因仍需现场确认'],
    inspectionItems: alert?.maintenanceSuggestion ?? [`核查${device.deviceName}现场状态`, '确认安全隔离与检修资源'],
    suggestedDeadline: device.riskLevel === '高风险' ? '立即核查并推进闭环' : '24小时内',
    relatedSpareParts: order?.requiredSpareParts.map((part) => part.partName) ?? [],
    confidence: 0.91,
  });
}

function repeatedAlertsDiagnosis(context: RuleDiagnosisContext) {
  const groups = new Map<string, number>();
  (context.alerts ?? []).forEach((alert) => alert.abnormalIndicators.forEach((indicator) => {
    const key = `${alert.deviceName}·${indicator}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }));
  const repeated = [...groups.entries()].filter(([, count]) => count > 1).sort((left, right) => right[1] - left[1]);
  return answerBase(context, {
    deviceId: 'ALL',
    riskJudgment: repeated.length ? `发现 ${repeated.length} 组重复异常，需要复核复发原因。` : '当前演示预警中未发现同一设备同一指标重复触发两次以上。',
    operatingCondition: '历史预警复发分析',
    abnormalIndicators: repeated.map(([name, count]) => `${name}（${count}次）`),
    trendEvidence: [`已检查 ${(context.alerts ?? []).length} 条预警记录`],
    suspectedCauses: ['重复异常可能与根因未消除、工况反复或测点问题有关'],
    inspectionItems: ['复核历史维修结果', '对比相同工况下的趋势', '校验异常测点'],
    suggestedDeadline: repeated.length ? '72小时内复核' : '持续观察',
    relatedSpareParts: [],
    confidence: 0.88,
  });
}

function unsupportedDiagnosis(context: RuleDiagnosisContext) {
  return answerBase(context, {
    deviceId: 'NONE',
    riskJudgment: '当前问题缺少可识别的设备、工单、备件或风险查询意图，因此未执行固定设备诊断。',
    operatingCondition: '未进入设备研判',
    abnormalIndicators: ['未识别明确业务意图'],
    trendEvidence: ['系统未查询或拼接1号引风机固定模板'],
    suspectedCauses: ['问题表述可能过于宽泛，或不属于当前规则型研判范围'],
    inspectionItems: ['请写明设备名称和查询目标，例如“1号引风机当前状态如何”'],
    suggestedDeadline: '无需处置',
    relatedSpareParts: [],
    confidence: 0.2,
  });
}

export function buildRuleBasedDiagnosis(context: RuleDiagnosisContext): AiDiagnosis {
  switch (context.intent) {
    case 'highest_risk_equipment': return highestRiskDiagnosis(context);
    case 'high_risk_equipment_list': return highRiskDiagnosis(context);
    case 'pending_work_orders': return pendingOrdersDiagnosis(context);
    case 'spare_part_availability': return sparePartsDiagnosis(context);
    case 'maintenance_priority': return maintenancePriorityDiagnosis(context);
    case 'repeated_alerts': return repeatedAlertsDiagnosis(context);
    case 'equipment_status':
    case 'abnormal_metrics':
    case 'diagnosis_reason': return deviceDiagnosis(context);
    case 'unsupported_or_ambiguous': return unsupportedDiagnosis(context);
  }
}
