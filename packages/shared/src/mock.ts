import type {
  Alert, Equipment, KnowledgeEntry, OperationLog, SparePart, SparePartTransaction, TelemetryPoint, WorkOrder,
} from './types.js';
import { getStockStatus } from './health.js';

function seededRandom(seed = 20260717): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

const now = () => new Date();
const ago = (hours: number) => new Date(now().getTime() - hours * 3_600_000).toISOString();
const dateAgo = (days: number) => ago(days * 24).slice(0, 10);
const fixed = (value: number, digits = 1) => Number(value.toFixed(digits));

interface EquipmentSeed extends Omit<Equipment, 'installationDate' | 'lastMaintenanceDate' | 'nextMaintenanceDate' | 'updatedAt' | 'dataSource'> {
  ageDays: number;
}

const equipmentSeeds: EquipmentSeed[] = [
  { deviceId: 'IDF-001', deviceName: '1号引风机', deviceType: '离心式引风机', systemArea: '烟气系统', manufacturer: '金通灵', model: 'Y5-48-12.5D', ageDays: 1680, runningStatus: '运行', operatingCondition: '高负荷稳定运行', healthScore: 68, riskLevel: '二级预警', vibration: 6.8, temperature: 86, current: 101, pressure: 0.86, speed: 1485, runningHours: 28340, responsiblePerson: '张工', responsibleUserId: 'zhang-gong', location: '焚烧间 A 区' },
  { deviceId: 'IDF-002', deviceName: '2号引风机', deviceType: '离心式引风机', systemArea: '烟气系统', manufacturer: '金通灵', model: 'Y5-48-12.5D', ageDays: 1650, runningStatus: '运行', operatingCondition: '稳定运行', healthScore: 88, riskLevel: '关注', vibration: 4.1, temperature: 73, current: 78, pressure: 0.67, speed: 1452, runningHours: 27680, responsiblePerson: '李工', responsibleUserId: 'li-gong', location: '焚烧间 B 区' },
  { deviceId: 'CWP-001', deviceName: '1号循环水泵', deviceType: '循环水泵', systemArea: '循环水系统', manufacturer: '凯泉泵业', model: 'KQSN350', ageDays: 1420, runningStatus: '运行', operatingCondition: '稳定运行', healthScore: 94, riskLevel: '健康', vibration: 2.6, temperature: 61, current: 69, pressure: 0.64, speed: 1460, runningHours: 22830, responsiblePerson: '王工', responsibleUserId: 'wang-gong', location: '汽机房一层' },
  { deviceId: 'CWP-002', deviceName: '2号循环水泵', deviceType: '循环水泵', systemArea: '循环水系统', manufacturer: '凯泉泵业', model: 'KQSN350', ageDays: 1400, runningStatus: '运行', operatingCondition: '低负荷', healthScore: 91, riskLevel: '健康', vibration: 2.4, temperature: 57, current: 46, pressure: 0.45, speed: 992, runningHours: 22120, responsiblePerson: '王工', responsibleUserId: 'wang-gong', location: '汽机房一层' },
  { deviceId: 'FDR-001', deviceName: '1号垃圾给料机', deviceType: '液压给料机', systemArea: '给料系统', manufacturer: '三峰环境', model: 'SF-FD200', ageDays: 1300, runningStatus: '运行', operatingCondition: '高负荷稳定运行', healthScore: 79, riskLevel: '关注', vibration: 4.8, temperature: 78, current: 103, pressure: 0.91, speed: 42, runningHours: 20450, responsiblePerson: '赵工', responsibleUserId: 'zhao-gong', location: '1号炉给料平台' },
  { deviceId: 'FDR-002', deviceName: '2号垃圾给料机', deviceType: '液压给料机', systemArea: '给料系统', manufacturer: '三峰环境', model: 'SF-FD200', ageDays: 1290, runningStatus: '运行', operatingCondition: '稳定运行', healthScore: 93, riskLevel: '健康', vibration: 3.1, temperature: 65, current: 74, pressure: 0.65, speed: 39, runningHours: 20190, responsiblePerson: '赵工', responsibleUserId: 'zhao-gong', location: '2号炉给料平台' },
  { deviceId: 'GRB-001', deviceName: '1号炉排减速机', deviceType: '炉排减速机', systemArea: '焚烧系统', manufacturer: 'SEW', model: 'MC3RLHF05', ageDays: 1550, runningStatus: '运行', operatingCondition: '稳定运行', healthScore: 73, riskLevel: '二级预警', vibration: 5.9, temperature: 82, current: 88, pressure: 0.51, speed: 38, runningHours: 24890, responsiblePerson: '陈工', responsibleUserId: 'chen-gong', location: '1号焚烧炉' },
  { deviceId: 'GRB-002', deviceName: '2号炉排减速机', deviceType: '炉排减速机', systemArea: '焚烧系统', manufacturer: 'SEW', model: 'MC3RLHF05', ageDays: 1540, runningStatus: '运行', operatingCondition: '稳定运行', healthScore: 90, riskLevel: '健康', vibration: 3.3, temperature: 67, current: 71, pressure: 0.49, speed: 37, runningHours: 24420, responsiblePerson: '陈工', responsibleUserId: 'chen-gong', location: '2号焚烧炉' },
  { deviceId: 'TUR-001', deviceName: '汽轮机', deviceType: '凝汽式汽轮机', systemArea: '汽机系统', manufacturer: '东方汽轮机', model: 'N25-3.43', ageDays: 1820, runningStatus: '运行', operatingCondition: '高负荷稳定运行', healthScore: 96, riskLevel: '健康', vibration: 2.2, temperature: 69, current: 86, pressure: 0.82, speed: 3000, runningHours: 30220, responsiblePerson: '刘工', responsibleUserId: 'liu-gong', location: '汽机房二层' },
  { deviceId: 'GEN-001', deviceName: '发电机', deviceType: '同步发电机', systemArea: '电气系统', manufacturer: '上海电气', model: 'QF-30-2', ageDays: 1820, runningStatus: '运行', operatingCondition: '高负荷稳定运行', healthScore: 92, riskLevel: '健康', vibration: 2.8, temperature: 72, current: 96, pressure: 0.74, speed: 3000, runningHours: 30170, responsiblePerson: '周工', responsibleUserId: 'zhou-gong', location: '汽机房二层' },
  { deviceId: 'ACP-001', deviceName: '空压机', deviceType: '螺杆空压机', systemArea: '压缩空气系统', manufacturer: '阿特拉斯', model: 'GA90+', ageDays: 980, runningStatus: '运行', operatingCondition: '低负荷', healthScore: 84, riskLevel: '关注', vibration: 3.7, temperature: 71, current: 52, pressure: 0.48, speed: 1020, runningHours: 15430, responsiblePerson: '孙工', responsibleUserId: 'sun-gong', location: '空压机房' },
  { deviceId: 'LTP-001', deviceName: '渗滤液处理泵', deviceType: '渗滤液泵', systemArea: '渗滤液系统', manufacturer: '格兰富', model: 'CR64-3', ageDays: 860, runningStatus: '检修', operatingCondition: '停机', healthScore: 55, riskLevel: '高风险', vibration: 0.2, temperature: 35, current: 0, pressure: 0, speed: 0, runningHours: 13390, responsiblePerson: '马工', responsibleUserId: 'ma-gong', location: '渗滤液处理站' },
];

export function createMockEquipment(): Equipment[] {
  return equipmentSeeds.map(({ ageDays, ...item }) => ({
    ...item, installationDate: dateAgo(ageDays), lastMaintenanceDate: dateAgo(80 + ageDays % 40),
    nextMaintenanceDate: new Date(now().getTime() + (30 + ageDays % 35) * 86_400_000).toISOString().slice(0, 10),
    dataSource: '模拟数据', updatedAt: ago(item.deviceId === 'IDF-001' ? 0.08 : 0.15),
  }));
}

export function createMockTelemetry(equipment = createMockEquipment()): Record<string, TelemetryPoint[]> {
  const random = seededRandom();
  return Object.fromEntries(equipment.map((device, deviceIndex) => {
    const historical = Array.from({ length: 348 }, (_, index): TelemetryPoint => {
      const hoursAgo = 720 - index * 2;
      const startCycle = device.runningStatus === '运行' && index % 84 === 0;
      const loadWave = Math.sin(index / 11 + deviceIndex);
      const condition = startCycle ? '启动' : device.operatingCondition;
      const vibration = Math.max(0, (device.deviceId === 'IDF-001' ? 3.8 : device.vibration) + loadWave * 0.22 + (startCycle ? 0.8 : 0) + (random() - 0.5) * 0.15);
      const temperature = Math.max(20, (device.deviceId === 'IDF-001' ? 70 : device.temperature) + loadWave * 1.5 + (startCycle ? 3 : 0) + (random() - 0.5) * 1.2);
      const healthScore = Math.max(0, Math.min(100, Math.round((device.deviceId === 'IDF-001' ? 92 : device.healthScore) - (startCycle ? 3 : 0) + loadWave)));
      return { timestamp: ago(hoursAgo), deviceId: device.deviceId, operatingCondition: condition, vibration: fixed(vibration), temperature: fixed(temperature), current: fixed(device.current + loadWave * 3 + (startCycle ? 12 : 0)), pressure: fixed(Math.max(0, device.pressure + loadWave * 0.025), 2), speed: fixed(Math.max(0, device.speed + loadWave * 9), 0), healthScore, riskLevel: healthScore >= 90 ? '健康' : healthScore >= 75 ? '关注' : healthScore >= 60 ? '二级预警' : '高风险' };
    });
    const recent = Array.from({ length: 49 }, (_, index): TelemetryPoint => {
      const hoursAgo = (48 - index) / 2;
      const isFanCase = device.deviceId === 'IDF-001';
      const trendIndex = Math.max(0, index - 36);
      const progress = trendIndex / 12;
      const noise = (random() - 0.5) * 0.18;
      let vibration = device.vibration + noise;
      let temperature = device.temperature + noise * 3;
      let healthScore = device.healthScore;
      if (isFanCase) {
        vibration = index <= 36 ? 4.15 + noise : 4.2 + 2.6 * progress + noise * 0.45;
        temperature = index <= 36 ? 71.8 + noise * 2 : 72 + 14 * progress + noise * 1.2;
        healthScore = index <= 36 ? 91 : Math.round(91 - 23 * progress);
      } else {
        vibration = device.vibration + Math.sin(index / 4 + deviceIndex) * 0.18 + noise;
        temperature = device.temperature + Math.sin(index / 7 + deviceIndex) * 1.3 + noise * 2;
        healthScore = Math.max(0, Math.min(100, Math.round(device.healthScore + Math.sin(index / 8) * 2)));
      }
      if (index === 48) { vibration = device.vibration; temperature = device.temperature; healthScore = device.healthScore; }
      return {
        timestamp: ago(hoursAgo), deviceId: device.deviceId, operatingCondition: device.operatingCondition,
        vibration: fixed(vibration), temperature: fixed(temperature), current: fixed(device.current + Math.sin(index / 5) * 2),
        pressure: fixed(Math.max(0, device.pressure + Math.sin(index / 6) * 0.025), 2),
        speed: fixed(Math.max(0, device.speed + Math.sin(index / 9) * 8), 0), healthScore,
        riskLevel: healthScore >= 90 ? '健康' : healthScore >= 75 ? '关注' : healthScore >= 60 ? '二级预警' : '高风险',
      };
    });
    return [device.deviceId, [...historical, ...recent]];
  }));
}

export function createMockAlerts(): Alert[] {
  return [
    { alertId: 'ALT-20260717-001', deviceId: 'IDF-001', deviceName: '1号引风机', alertTime: ago(1.2), riskLevel: '二级预警', healthScore: 68, operatingCondition: '高负荷稳定运行', abnormalIndicators: ['轴承振动', '轴承温度'], indicatorContributions: { vibration: 14.8, temperature: 8.6, current: 2.1, pressure: 0.8, speed: 0.2 }, suspectedCause: '轴承磨损或润滑状态异常', aiAnalysis: '过去 6 小时振动与温度呈持续上升趋势，疑似与轴承磨损、润滑状态或联轴器对中状态有关。', maintenanceSuggestion: ['检查润滑油状态', '测量轴承间隙', '检查联轴器对中', '紧固地脚螺栓'], suggestedDeadline: '24小时内', alertStatus: '待确认', confidence: 0.86, source: '模拟规则模型' },
    { alertId: 'ALT-20260717-002', deviceId: 'GRB-001', deviceName: '1号炉排减速机', alertTime: ago(4), riskLevel: '二级预警', healthScore: 73, operatingCondition: '稳定运行', abnormalIndicators: ['箱体温度', '振动'], indicatorContributions: { vibration: 11.2, temperature: 9.8, current: 1.7, pressure: 0.3, speed: 0.7 }, suspectedCause: '润滑油劣化或齿轮啮合状态异常', aiAnalysis: '减速机温升与振动同步偏高，建议结合油样和啮合检查确认。', maintenanceSuggestion: ['检查油位和油质', '检查齿轮啮合', '复核安装紧固'], suggestedDeadline: '24小时内', alertStatus: '已确认', confidence: 0.79, source: '模拟规则模型', acknowledgedBy: '陈工', acknowledgedAt: ago(3.5) },
    { alertId: 'ALT-20260716-003', deviceId: 'LTP-001', deviceName: '渗滤液处理泵', alertTime: ago(19), riskLevel: '高风险', healthScore: 55, operatingCondition: '停机', abnormalIndicators: ['出口压力', '机械密封'], indicatorContributions: { vibration: 4, temperature: 2, current: 3, pressure: 24, speed: 1 }, suspectedCause: '机械密封失效或泵体堵塞', aiAnalysis: '设备已进入检修停机状态，需完成隔离后检查泵体和机械密封。', maintenanceSuggestion: ['执行挂牌上锁', '拆检机械密封', '清理泵体'], suggestedDeadline: '立即安排', alertStatus: '处理中', confidence: 0.83, source: '模拟规则模型', relatedWorkOrderId: 'WO-20260716-003', acknowledgedBy: '马工', acknowledgedAt: ago(18.5) },
    { alertId: 'ALT-20260715-004', deviceId: 'ACP-001', deviceName: '空压机', alertTime: ago(40), riskLevel: '关注', healthScore: 84, operatingCondition: '低负荷', abnormalIndicators: ['排气温度'], indicatorContributions: { vibration: 2.2, temperature: 7.4, current: 1.1, pressure: 0.4, speed: 0.2 }, suspectedCause: '冷却效率下降或润滑油状态偏差', aiAnalysis: '排气温度轻度偏高，尚未达到高风险阈值。', maintenanceSuggestion: ['清洁冷却器', '检查润滑油液位'], suggestedDeadline: '72小时内', alertStatus: '已生成工单', confidence: 0.71, source: '模拟规则模型', relatedWorkOrderId: 'WO-20260715-002', acknowledgedBy: '孙工', acknowledgedAt: ago(38) },
    { alertId: 'ALT-20260714-005', deviceId: 'IDF-002', deviceName: '2号引风机', alertTime: ago(72), riskLevel: '关注', healthScore: 86, operatingCondition: '稳定运行', abnormalIndicators: ['振动'], indicatorContributions: { vibration: 7.2, temperature: 1.1, current: 0.8, pressure: 0.2, speed: 0.3 }, suspectedCause: '叶轮积灰或轻微不平衡', aiAnalysis: '振动短时波动后恢复，建议持续观察。', maintenanceSuggestion: ['观察趋势', '下次停机检查叶轮积灰'], suggestedDeadline: '7天内', alertStatus: '已关闭', confidence: 0.66, source: '模拟规则模型', closedAt: ago(48) },
  ];
}

export function createMockSpareParts(): SparePart[] {
  const rows: Array<Omit<SparePart, 'stockStatus' | 'lastInboundDate'>> = [
    { partId: 'SP-001', partName: '风机轴承', partCategory: '轴承', applicableEquipment: ['引风机'], currentStock: 6, safeStock: 3, unit: '套', storageLocation: 'A-01-03', supplier: 'SKF授权供应商', unitCost: 4860, remark: '适配 IDF-001/002' },
    { partId: 'SP-002', partName: '通用润滑油', partCategory: '油品', applicableEquipment: ['风机', '减速机', '空压机'], currentStock: 12, safeStock: 8, unit: '桶', storageLocation: 'B-02-01', supplier: '美孚工业油', unitCost: 680, remark: '18L/桶' },
    { partId: 'SP-003', partName: '联轴器', partCategory: '传动件', applicableEquipment: ['引风机', '循环水泵'], currentStock: 2, safeStock: 2, unit: '套', storageLocation: 'A-02-02', supplier: '无锡传动', unitCost: 3200, remark: '库存偏低' },
    { partId: 'SP-004', partName: '机械密封件', partCategory: '密封件', applicableEquipment: ['循环水泵', '渗滤液泵'], currentStock: 0, safeStock: 2, unit: '套', storageLocation: 'A-03-01', supplier: '博格曼', unitCost: 2100, remark: '已触发缺货提醒' },
    { partId: 'SP-005', partName: '温度传感器', partCategory: '仪表', applicableEquipment: ['通用'], currentStock: 5, safeStock: 3, unit: '只', storageLocation: 'C-01-01', supplier: '菲尼克斯', unitCost: 560, remark: 'PT100' },
    { partId: 'SP-006', partName: '振动传感器', partCategory: '仪表', applicableEquipment: ['旋转设备'], currentStock: 3, safeStock: 3, unit: '只', storageLocation: 'C-01-02', supplier: '恩德福克', unitCost: 1850, remark: '库存偏低' },
    { partId: 'SP-007', partName: '压力传感器', partCategory: '仪表', applicableEquipment: ['泵', '空压机'], currentStock: 7, safeStock: 3, unit: '只', storageLocation: 'C-01-03', supplier: '威卡', unitCost: 920, remark: '0—1.6MPa' },
    { partId: 'SP-008', partName: '电机皮带', partCategory: '传动件', applicableEquipment: ['给料机', '空压机'], currentStock: 9, safeStock: 4, unit: '根', storageLocation: 'A-04-02', supplier: '盖茨', unitCost: 260, remark: 'B 型三角带' },
  ];
  return rows.map((item, index) => ({ ...item, stockStatus: getStockStatus(item.currentStock, item.safeStock), lastInboundDate: dateAgo(15 + index * 3) }));
}

export function createMockWorkOrders(): WorkOrder[] {
  const createdTimes = [ago(18), ago(38), ago(96)];
  return [
    { id: 'WO-20260716-003', workOrderNo: 'WO-20260716-003', workOrderId: 'WO-20260716-003', sourceAlertId: 'ALT-20260716-003', deviceId: 'LTP-001', deviceName: '渗滤液处理泵', riskLevel: '高风险', faultPart: '出口与机械密封', faultType: '压力异常及密封渗漏', faultDescription: '出口压力异常并伴随机械密封渗漏', maintenanceSuggestion: ['执行安全隔离', '拆检机械密封和泵体'], assignee: '马工', assigneeUserId: 'ma-gong', createdBy: '黄浩', createdAt: createdTimes[0]!, createdTime: createdTimes[0]!, deadline: ago(-6), requiredSpareParts: [{ partId: 'SP-004', partName: '机械密封件', quantity: 1, unit: '套' }], consumedSpareParts: [], processingRecord: [{ id: 'REC-001', time: ago(18), operator: '马工', action: '开始检修', detail: '已完成停电、泄压和挂牌上锁' }], healthScoreBefore: 55, status: '检修中' },
    { id: 'WO-20260715-002', workOrderNo: 'WO-20260715-002', workOrderId: 'WO-20260715-002', sourceAlertId: 'ALT-20260715-004', deviceId: 'ACP-001', deviceName: '空压机', riskLevel: '关注', faultPart: '排气系统', faultType: '排气温度偏高', faultDescription: '排气温度持续偏高', maintenanceSuggestion: ['清洁冷却器', '检查润滑油'], assignee: '孙工', assigneeUserId: 'sun-gong', createdBy: '黄浩', createdAt: createdTimes[1]!, createdTime: createdTimes[1]!, deadline: ago(-34), requiredSpareParts: [{ partId: 'SP-002', partName: '通用润滑油', quantity: 1, unit: '桶' }], consumedSpareParts: [], processingRecord: [], healthScoreBefore: 84, status: '已接单' },
    { id: 'WO-20260713-001', workOrderNo: 'WO-20260713-001', workOrderId: 'WO-20260713-001', deviceId: 'CWP-001', deviceName: '1号循环水泵', riskLevel: '关注', faultPart: '轴承润滑点', faultType: '计划性润滑检查', faultDescription: '计划性润滑检查', maintenanceSuggestion: ['检查轴承润滑状态'], assignee: '王工', assigneeUserId: 'wang-gong', createdBy: '王工', createdAt: createdTimes[2]!, createdTime: createdTimes[2]!, deadline: ago(24), requiredSpareParts: [], consumedSpareParts: [], processingRecord: [], healthScoreBefore: 91, status: '待接单' },
  ];
}

export function createMockKnowledge(): KnowledgeEntry[] {
  const base = { applicableCondition: '稳定运行及高负荷工况', source: '设备运维手册与模拟专家规则', updatedAt: dateAgo(2) };
  return [
    { ...base, knowledgeId: 'KB-001', title: '风机轴承振动升高', deviceType: '风机', faultPhenomenon: '轴承座振动持续升高', abnormalIndicators: ['轴承振动', '轴承温度'], possibleCauses: ['轴承磨损', '转子不平衡', '联轴器不对中', '地脚松动'], inspectionSteps: ['复核振动测点', '检查轴承游隙', '检查联轴器对中', '检查地脚螺栓'], handlingMethod: ['补充或更换润滑油', '校正联轴器', '按检查结果更换轴承'], safetyReminder: '检查前执行停机、断电和防转动措施；是否停机由现场负责人依据规程决定。', relatedSpareParts: ['风机轴承', '通用润滑油', '联轴器'] },
    { ...base, knowledgeId: 'KB-002', title: '轴承温度异常', deviceType: '旋转设备', faultPhenomenon: '轴承温度超过工况基准并持续上升', abnormalIndicators: ['轴承温度'], possibleCauses: ['润滑不足', '轴承间隙不当', '冷却不良', '负载偏高'], inspectionSteps: ['校验温度测点', '检查润滑油位和油质', '核对负载', '听诊轴承异响'], handlingMethod: ['恢复合理润滑', '清理冷却通道', '必要时更换轴承'], safetyReminder: '不得在未采取防护时接触高温或旋转部件。', relatedSpareParts: ['通用润滑油', '温度传感器', '风机轴承'] },
    { ...base, knowledgeId: 'KB-003', title: '电机电流波动', deviceType: '电机', faultPhenomenon: '三相电流或负载电流持续波动', abnormalIndicators: ['电流'], possibleCauses: ['负载波动', '电源不平衡', '转子阻力变化', '测量回路异常'], inspectionSteps: ['核对三相电流', '检查供电质量', '关联分析机械负载', '校验电流传感器'], handlingMethod: ['消除机械卡阻', '处理供电不平衡', '更换故障测点'], safetyReminder: '电气检查由具备资质的人员执行。', relatedSpareParts: ['电机皮带'] },
    { ...base, knowledgeId: 'KB-004', title: '循环水泵压力下降', deviceType: '循环水泵', faultPhenomenon: '出口压力和流量同步下降', abnormalIndicators: ['压力'], possibleCauses: ['入口堵塞', '叶轮磨损', '汽蚀', '机械密封泄漏'], inspectionSteps: ['检查入口滤网', '检查吸入压力', '听诊汽蚀声', '检查密封泄漏'], handlingMethod: ['清理滤网', '恢复入口液位', '检修叶轮或密封'], safetyReminder: '拆检前泄压、排空并完成能源隔离。', relatedSpareParts: ['机械密封件', '压力传感器'] },
    { ...base, knowledgeId: 'KB-005', title: '炉排减速机温升', deviceType: '炉排减速机', faultPhenomenon: '箱体温度和振动高于历史基线', abnormalIndicators: ['箱体温度', '振动'], possibleCauses: ['润滑油劣化', '齿轮啮合异常', '轴承磨损'], inspectionSteps: ['检查油位油质', '采集振动频谱', '检查齿轮啮合痕迹'], handlingMethod: ['更换润滑油', '调整啮合间隙', '更换轴承'], safetyReminder: '防止炉排反转和高温烫伤。', relatedSpareParts: ['通用润滑油'] },
    { ...base, knowledgeId: 'KB-006', title: '给料机堵塞风险', deviceType: '给料机', faultPhenomenon: '电流升高、速度下降或动作迟缓', abnormalIndicators: ['电流', '转速'], possibleCauses: ['垃圾缠绕', '异物卡阻', '液压压力不足'], inspectionSteps: ['核对电流与速度', '检查料斗积料', '检查液压压力'], handlingMethod: ['按规程清堵', '恢复液压压力', '检查传动件'], safetyReminder: '严禁人员进入未隔离的料斗和运动区域。', relatedSpareParts: ['电机皮带', '压力传感器'] },
    { ...base, knowledgeId: 'KB-007', title: '联轴器不对中', deviceType: '旋转设备', faultPhenomenon: '轴向振动突出并伴温升', abnormalIndicators: ['轴承振动', '轴承温度'], possibleCauses: ['安装偏差', '基础沉降', '热膨胀补偿不足'], inspectionSteps: ['测量轴向与径向振动', '激光对中', '检查软脚'], handlingMethod: ['重新对中', '消除软脚', '更换磨损联轴器'], safetyReminder: '对中作业前确认设备无法意外启动。', relatedSpareParts: ['联轴器'] },
    { ...base, knowledgeId: 'KB-008', title: '润滑状态异常', deviceType: '通用', faultPhenomenon: '温度上升、振动增加或出现异响', abnormalIndicators: ['轴承温度', '轴承振动'], possibleCauses: ['油量不足', '油品污染', '油脂混用', '润滑周期不当'], inspectionSteps: ['检查油位', '观察油品颜色与杂质', '核对润滑牌号', '必要时取样化验'], handlingMethod: ['补油或换油', '清洁润滑回路', '修订润滑周期'], safetyReminder: '使用与设备说明书相符的油品，防止高温油液伤害。', relatedSpareParts: ['通用润滑油'] },
  ];
}

export function createMockData() {
  const equipment = createMockEquipment();
  return {
    equipment,
    telemetry: createMockTelemetry(equipment),
    alerts: createMockAlerts(),
    workOrders: createMockWorkOrders(),
    spareParts: createMockSpareParts(),
    spareTransactions: [] as SparePartTransaction[],
    knowledge: createMockKnowledge(),
    operationLogs: [
      { logId: 'LOG-001', entityType: 'alert', entityId: 'ALT-20260717-001', action: '触发预警', operator: '模拟规则模型', detail: '振动和轴承温度持续上升', timestamp: ago(1.2) },
      { logId: 'LOG-002', entityType: 'device', entityId: 'IDF-001', action: '更新健康度', operator: '模拟规则模型', detail: '健康度更新为 68，风险等级为二级预警', timestamp: ago(0.08) },
    ] as OperationLog[],
  };
}
