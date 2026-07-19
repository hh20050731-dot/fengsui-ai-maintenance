import { describe, expect, it, vi } from 'vitest';
import { MockNotificationProvider } from '../providers/notification-provider.js';
import { MockRepository } from '../repositories/mock-repository.js';
import { OperationsJobsService, evaluateReminderRules } from './operations-jobs-service.js';

describe('自动督办与每日简报', () => {
  it('命中30分钟未接单、4小时内截止、待验证和已完成规则', async () => {
    const repository = new MockRepository();
    const [pending, repairing, completed] = await repository.listWorkOrders();
    const now = Date.parse('2026-07-19T10:00:00.000Z');
    await repository.updateWorkOrder(pending!.id, {
      riskLevel: '高风险', status: '待接单', createdAt: '2026-07-19T09:00:00.000Z', createdTime: '2026-07-19T09:00:00.000Z', deadline: '2026-07-19T13:00:00.000Z',
    });
    await repository.updateWorkOrder(repairing!.id, { status: '待验证' });
    await repository.updateWorkOrder(completed!.id, { status: '已完成', completedAt: '2026-07-19T09:30:00.000Z' });
    expect(evaluateReminderRules((await repository.getWorkOrder(pending!.id))!, now).map((item) => item.rule)).toEqual(['high-risk-unaccepted-30m', 'deadline-within-4h']);
    expect(evaluateReminderRules((await repository.getWorkOrder(repairing!.id))!, now).map((item) => item.rule)).toContain('waiting-verification');
    expect(evaluateReminderRules((await repository.getWorkOrder(completed!.id))!, now).map((item) => item.rule)).toContain('completed');
  });

  it('督办通知幂等且日报包含设备、工单和低库存统计', async () => {
    const repository = new MockRepository();
    const notifications = new MockNotificationProvider();
    const sendCard = vi.spyOn(notifications, 'sendCard');
    const jobs = new OperationsJobsService(repository, notifications);
    const order = (await repository.listWorkOrders())[0]!;
    const now = Date.parse('2026-07-19T10:00:00.000Z');
    await repository.updateWorkOrder(order.id, {
      riskLevel: '高风险', status: '待接单', createdAt: '2026-07-19T09:00:00.000Z', createdTime: '2026-07-19T09:00:00.000Z', deadline: '2026-07-19T13:00:00.000Z',
    });
    const first = await jobs.runWorkOrderReminders(now);
    expect(first.reminders.map((item) => item.rule)).toEqual(expect.arrayContaining(['high-risk-unaccepted-30m', 'deadline-within-4h']));
    const sendCount = sendCard.mock.calls.length;
    const second = await jobs.runWorkOrderReminders(now);
    expect(second.reminders).toHaveLength(0);
    expect(sendCard).toHaveBeenCalledTimes(sendCount);

    const daily = await jobs.runDailyOperationsBrief(now);
    expect(daily.brief.equipment.total).toBe(12);
    expect(daily.brief.workOrders.pending).toBeGreaterThan(0);
    expect(daily.brief.workOrders).toHaveProperty('completedToday');
    expect(daily.brief.workOrders).toHaveProperty('imminentOrOverdue');
    expect(daily.brief.lowStockParts.length).toBeGreaterThan(0);
    expect(daily.delivery.delivered).toBe(true);

    const duplicateDaily = await jobs.runDailyOperationsBrief(now);
    expect(duplicateDaily.duplicate).toBe(true);
    expect(sendCard).toHaveBeenCalledTimes(sendCount + 1);
  });

  it('通知失败会报告部分失败并允许下一次任务重试', async () => {
    const repository = new class extends MockRepository {
      override async listWorkOrders() {
        return [(await super.listWorkOrders())[0]!];
      }
    }();
    const notifications = new MockNotificationProvider();
    const sendCard = vi.spyOn(notifications, 'sendCard')
      .mockResolvedValueOnce({ messageId: '', delivered: false, preview: {}, error: 'local simulated failure' })
      .mockResolvedValueOnce({ messageId: 'mock-retry-success', delivered: true, preview: {} });
    const jobs = new OperationsJobsService(repository, notifications);
    const order = (await repository.listWorkOrders())[0]!;
    const now = Date.parse('2026-07-19T10:00:00.000Z');
    await repository.updateWorkOrder(order.id, {
      riskLevel: '高风险', status: '待接单', createdAt: '2026-07-19T09:00:00.000Z', createdTime: '2026-07-19T09:00:00.000Z', deadline: '2026-07-19T18:00:00.000Z',
    });
    const first = await jobs.runWorkOrderReminders(now);
    expect(first.reminders[0]?.delivery.delivered).toBe(false);
    const second = await jobs.runWorkOrderReminders(now);
    expect(second.reminders[0]?.delivery.delivered).toBe(true);
    expect(sendCard).toHaveBeenCalledTimes(2);
  });

  it('空Repository生成零值日报而不写死演示数字', async () => {
    class EmptyRepository extends MockRepository {
      override async listEquipment() { return []; }
      override async listAlerts() { return []; }
      override async listWorkOrders() { return []; }
      override async listSpareParts() { return []; }
    }
    const jobs = new OperationsJobsService(new EmptyRepository(), new MockNotificationProvider());
    const result = await jobs.runDailyOperationsBrief(Date.parse('2026-07-19T10:00:00.000Z'));
    expect(result.brief.equipment.total).toBe(0);
    expect(result.brief.newAlerts).toBe(0);
    expect(result.brief.workOrders).toEqual({ pending: 0, repairing: 0, verifying: 0, completedToday: 0, imminentOrOverdue: 0 });
    expect(result.brief.lowStockParts).toEqual([]);
  });
});
