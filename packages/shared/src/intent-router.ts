import type { DiagnosisIntent } from './types.js';

export type DiagnosisDataRequirement =
  | 'equipment'
  | 'telemetry'
  | 'alerts'
  | 'workOrders'
  | 'spareParts'
  | 'knowledge';

export interface IntentRoute {
  intent: DiagnosisIntent;
  requirements: DiagnosisDataRequirement[];
  requiresDevice: boolean;
}

const routeRequirements: Record<DiagnosisIntent, IntentRoute> = {
  highest_risk_equipment: { intent: 'highest_risk_equipment', requirements: ['equipment'], requiresDevice: false },
  high_risk_equipment_list: { intent: 'high_risk_equipment_list', requirements: ['equipment'], requiresDevice: false },
  equipment_status: { intent: 'equipment_status', requirements: ['equipment', 'telemetry', 'alerts', 'knowledge'], requiresDevice: true },
  abnormal_metrics: { intent: 'abnormal_metrics', requirements: ['equipment', 'telemetry', 'alerts', 'knowledge'], requiresDevice: true },
  pending_work_orders: { intent: 'pending_work_orders', requirements: ['workOrders'], requiresDevice: false },
  spare_part_availability: { intent: 'spare_part_availability', requirements: ['spareParts'], requiresDevice: false },
  maintenance_priority: { intent: 'maintenance_priority', requirements: ['equipment', 'alerts', 'workOrders'], requiresDevice: false },
  diagnosis_reason: { intent: 'diagnosis_reason', requirements: ['equipment', 'telemetry', 'alerts', 'knowledge'], requiresDevice: true },
  repeated_alerts: { intent: 'repeated_alerts', requirements: ['alerts'], requiresDevice: false },
  unsupported_or_ambiguous: { intent: 'unsupported_or_ambiguous', requirements: [], requiresDevice: false },
};

const chineseDeviceNumbers: Record<string, string> = {
  一: '1',
  二: '2',
  两: '2',
  三: '3',
  四: '4',
  五: '5',
  六: '6',
  七: '7',
  八: '8',
  九: '9',
  十: '10',
};

const deviceStatusKeywords = [
  '状态',
  '当前',
  '健康',
  '健康度',
  '情况',
  '怎么样',
  '异常',
  '风险',
  '查询',
  '查看',
];

/** 统一设备名称、全角字符和常用标点，供网站与飞书共用。 */
export function normalizeDiagnosisQuestion(question: string) {
  return question
    .normalize('NFKC')
    .replace(/([一二两三四五六七八九十])号(?=引风机|循环水泵|垃圾给料机|炉排减速机)/g, (_, number: string) => `${chineseDeviceNumbers[number] ?? number}号`)
    .replace(/\bIDF[\s_-]*0*1\b/gi, '1号引风机')
    .replace(/[、；]/g, ',')
    .replace(/：/g, ':')
    .replace(/。/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 网站辅助研判与飞书机器人共用的确定性意图路由器。 */
export class IntentRouter {
  route(question: string, selectedDeviceId?: string): IntentRoute {
    const text = normalizeDiagnosisQuestion(question).replace(/[？?！!，,.。\s]/g, '');
    const hasDeviceReference = /(?:\d+号)?(?:引风机|循环水泵|垃圾给料机|炉排减速机|汽轮机|发电机|空压机|渗滤液处理泵)|IDF-\d+/i.test(text);

    if ((text.includes('为什么') || text.includes('原因') || text.includes('如何判断'))
      && (text.includes('温升') || text.includes('故障') || text.includes('风险') || hasDeviceReference)) {
      return routeRequirements.diagnosis_reason;
    }
    if (text.includes('异常指标') || text.includes('哪些指标异常') || text.includes('指标为什么异常')) {
      return routeRequirements.abnormal_metrics;
    }
    if (text.includes('哪些高风险设备') || text.includes('有哪些高风险设备') || text.includes('高风险设备有哪些')) {
      return routeRequirements.high_risk_equipment_list;
    }
    if (text.includes('风险最高') || text.includes('最高风险')) return routeRequirements.highest_risk_equipment;
    if (text.includes('备件') || text.includes('库存是否满足') || text.includes('库存够不够')) return routeRequirements.spare_part_availability;
    if (text.includes('优先检修') || text.includes('优先维修') || text.includes('应该先检修')) return routeRequirements.maintenance_priority;
    if (text.includes('重复发生') || text.includes('重复异常')) return routeRequirements.repeated_alerts;
    if (text.includes('待处理工单') || text.includes('哪些工单') || text.includes('工单即将超期') || text.includes('工单超期')) return routeRequirements.pending_work_orders;
    if (hasDeviceReference && deviceStatusKeywords.some((keyword) => text.includes(keyword))) {
      return routeRequirements.equipment_status;
    }
    if (selectedDeviceId && (text.includes('设备状态') || text.includes('当前设备') || text.includes('主要风险') || text.includes('研判'))) {
      return routeRequirements.equipment_status;
    }
    return routeRequirements.unsupported_or_ambiguous;
  }
}

export const intentRouter = new IntentRouter();

export function getDiagnosisIntentRoute(question: string, selectedDeviceId?: string) {
  return intentRouter.route(question, selectedDeviceId);
}
