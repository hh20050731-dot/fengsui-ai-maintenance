import type { Equipment, WorkOrder } from '@fengsui/shared';
import { buildTextCard, type NotificationProvider, type NotificationResult } from '../providers/notification-provider.js';
import type { DataRepository } from '../repositories/data-repository.js';

export type ReminderRule = 'high-risk-unaccepted-30m' | 'deadline-within-4h' | 'waiting-verification' | 'completed';
export const OPERATIONS_TIME_ZONE = 'Asia/Shanghai';
const SHANGHAI_OFFSET_MS = 8 * 3_600_000;

export interface WorkOrderReminder {
  rule: ReminderRule;
  workOrderNo: string;
  deviceName: string;
  status: WorkOrder['status'];
  reason: string;
  delivery: NotificationResult;
}

function isOpen(order: WorkOrder) {
  return !['已完成', '已取消'].includes(order.status);
}

export function evaluateReminderRules(order: WorkOrder, now = Date.now()) {
  const rules: Array<{ rule: ReminderRule; reason: string }> = [];
  const age = now - Date.parse(order.createdAt || order.createdTime);
  const deadlineGap = Date.parse(order.deadline) - now;
  if (order.riskLevel === '高风险' && order.status === '待接单' && age >= 30 * 60_000) {
    rules.push({ rule: 'high-risk-unaccepted-30m', reason: '高风险工单创建已超过30分钟仍未接单' });
  }
  if (isOpen(order) && Number.isFinite(deadlineGap) && deadlineGap <= 4 * 3_600_000) {
    rules.push({ rule: 'deadline-within-4h', reason: deadlineGap < 0 ? '工单已经超过建议处理时限' : '距建议处理时限不足4小时' });
  }
  if (order.status === '待验证') rules.push({ rule: 'waiting-verification', reason: '工单已进入待验证，需要现场负责人完成效果确认' });
  const completedAge = order.completedAt ? now - Date.parse(order.completedAt) : Number.POSITIVE_INFINITY;
  if (order.status === '已完成' && completedAge >= 0 && completedAge <= 24 * 3_600_000) rules.push({ rule: 'completed', reason: '工单已经完成闭环' });
  return rules;
}

export function buildReminderCard(order: WorkOrder, rule: ReminderRule, reason: string) {
  const color = order.status === '已完成' ? 'green' : order.riskLevel === '高风险' ? 'red' : 'orange';
  return buildTextCard(
    `工单督办 · ${order.workOrderNo}`,
    `**设备：**${order.deviceName}（${order.deviceId}）\n**风险等级：**${order.riskLevel}\n**当前状态：**${order.status}\n**督办原因：**${reason}\n**计划时限：**${order.deadline}\n\n> LOCAL/规则型督办结果，正式处置请遵循现场安全规程。`,
    color,
  );
}

export interface DailyOperationsBrief {
  generatedAt: string;
  equipment: { total: number; healthy: number; attention: number; warning: number; highRisk: number; offline: number };
  highRiskEquipment: Array<{ deviceId: string; deviceName: string; healthScore: number }>;
  newAlerts: number;
  workOrders: { pending: number; repairing: number; verifying: number; completedToday: number; imminentOrOverdue: number };
  lowStockParts: string[];
  tomorrowPriorities: string[];
}

export function buildDailyBriefCard(brief: DailyOperationsBrief) {
  return buildTextCard(
    '烽燧智守 · 每日运维简报',
    `**统计时区：**${OPERATIONS_TIME_ZONE}\n**设备状态：**共${brief.equipment.total}台，健康${brief.equipment.healthy}台，关注${brief.equipment.attention}台，预警${brief.equipment.warning}台，高风险${brief.equipment.highRisk}台，离线${brief.equipment.offline}台\n**高风险设备：**${brief.highRiskEquipment.map((item) => `${item.deviceName}（健康度${item.healthScore}）`).join('、') || '无'}\n**今日新增预警：**${brief.newAlerts}条\n**工单：**待接单${brief.workOrders.pending}、检修中${brief.workOrders.repairing}、待验证${brief.workOrders.verifying}、今日完成${brief.workOrders.completedToday}、临期或逾期${brief.workOrders.imminentOrOverdue}\n**低库存备件：**${brief.lowStockParts.join('、') || '无'}\n**明日重点任务：**${brief.tomorrowPriorities.join('；') || '按计划巡检'}\n\n> 模拟数据与规则型简报，仅用于比赛演示。`,
    'blue',
  );
}

function riskRank(item: Equipment) {
  const level = { 离线: -1, 健康: 0, 关注: 1, 二级预警: 2, 高风险: 3 }[item.riskLevel];
  return level * 100 + 100 - item.healthScore;
}

function shanghaiDayKey(now: number) {
  return new Date(now + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);
}

function startOfShanghaiDay(now: number) {
  return Date.parse(`${shanghaiDayKey(now)}T00:00:00+08:00`);
}

export class OperationsJobsService {
  constructor(private readonly repository: DataRepository, private readonly notifications: NotificationProvider) {}

  async runWorkOrderReminders(now = Date.now()) {
    const orders = await this.repository.listWorkOrders();
    const reminders: WorkOrderReminder[] = [];
    for (const order of orders) {
      for (const candidate of evaluateReminderRules(order, now)) {
        const marker = `${order.workOrderNo}:${candidate.rule}`;
        const existing = await this.repository.listOperationLogs(marker);
        if (existing.some((log) => log.action === '自动督办通知')) continue;
        const delivery = await this.notifications.sendCard(buildReminderCard(order, candidate.rule, candidate.reason));
        await this.repository.addOperationLog({
          logId: `LOG-JOB-${order.workOrderNo}-${candidate.rule}`,
          entityType: 'job-reminder',
          entityId: marker,
          action: delivery.delivered ? '自动督办通知' : '自动督办通知失败',
          operator: '系统定时任务',
          detail: delivery.delivered ? `规则：${candidate.rule}；通知已发送` : `规则：${candidate.rule}；发送失败但不影响工单：${delivery.error ?? '未知错误'}`,
          timestamp: new Date(now).toISOString(),
        });
        reminders.push({ ...candidate, workOrderNo: order.workOrderNo, deviceName: order.deviceName, status: order.status, delivery });
      }
    }
    return { generatedAt: new Date(now).toISOString(), reminders };
  }

  async runDailyOperationsBrief(now = Date.now()) {
    const [equipment, alerts, orders, parts] = await Promise.all([
      this.repository.listEquipment(),
      this.repository.listAlerts(),
      this.repository.listWorkOrders(),
      this.repository.listSpareParts(),
    ]);
    const startOfDay = startOfShanghaiDay(now);
    const dayKey = shanghaiDayKey(now);
    const highRisk = equipment.filter((item) => item.riskLevel === '高风险').sort((left, right) => riskRank(right) - riskRank(left));
    const ranked = equipment.slice().sort((left, right) => riskRank(right) - riskRank(left));
    const brief: DailyOperationsBrief = {
      generatedAt: new Date(now).toISOString(),
      equipment: {
        total: equipment.length,
        healthy: equipment.filter((item) => item.riskLevel === '健康').length,
        attention: equipment.filter((item) => item.riskLevel === '关注').length,
        warning: equipment.filter((item) => item.riskLevel === '二级预警').length,
        highRisk: highRisk.length,
        offline: equipment.filter((item) => item.riskLevel === '离线').length,
      },
      highRiskEquipment: highRisk.map((item) => ({ deviceId: item.deviceId, deviceName: item.deviceName, healthScore: item.healthScore })),
      newAlerts: alerts.filter((item) => Date.parse(item.alertTime) >= startOfDay).length,
      workOrders: {
        pending: orders.filter((item) => item.status === '待接单').length,
        repairing: orders.filter((item) => item.status === '检修中').length,
        verifying: orders.filter((item) => item.status === '待验证').length,
        completedToday: orders.filter((item) => item.status === '已完成' && item.completedAt && Date.parse(item.completedAt) >= startOfDay).length,
        imminentOrOverdue: orders.filter((item) => isOpen(item) && Number.isFinite(Date.parse(item.deadline)) && Date.parse(item.deadline) <= now + 4 * 3_600_000).length,
      },
      lowStockParts: parts.filter((item) => item.stockStatus !== '充足').map((item) => `${item.partName}（${item.stockStatus}）`),
      tomorrowPriorities: ranked.slice(0, 3).map((item) => `${item.deviceName}：${item.riskLevel}，健康度${item.healthScore}`),
    };
    const existing = await this.repository.listOperationLogs(dayKey);
    if (existing.some((log) => log.entityType === 'daily-brief' && log.action === '生成每日运维简报')) {
      return {
        brief,
        delivery: { messageId: '', delivered: false, preview: buildDailyBriefCard(brief), error: '当日简报已发送，本次未重复发送' },
        duplicate: true,
      };
    }
    const delivery = await this.notifications.sendCard(buildDailyBriefCard(brief));
    await this.repository.addOperationLog({
      logId: `LOG-DAILY-${dayKey}`,
      entityType: 'daily-brief',
      entityId: dayKey,
      action: delivery.delivered ? '生成每日运维简报' : '每日运维简报发送失败',
      operator: '系统定时任务',
      detail: delivery.delivered ? '简报通知已发送' : `简报已生成，通知失败：${delivery.error ?? '未知错误'}`,
      timestamp: new Date(now).toISOString(),
    });
    return { brief, delivery, duplicate: false };
  }
}
