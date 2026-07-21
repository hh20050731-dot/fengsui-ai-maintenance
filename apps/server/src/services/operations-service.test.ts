import { describe, expect, it, vi } from 'vitest';
import { MockRepository } from '../repositories/mock-repository.js';
import { RuleBasedDiagnosisProvider } from '../providers/ai-diagnosis-provider.js';
import { MockNotificationProvider } from '../providers/notification-provider.js';
import { OperationsService } from './operations-service.js';

describe('库存扣减与幂等控制', () => {
  it('相同幂等键重复出库只扣减一次', async () => {
    const repository = new MockRepository(); const service = new OperationsService(repository, new RuleBasedDiagnosisProvider(), new MockNotificationProvider());
    const before = (await repository.getSparePart('SP-001'))!.currentStock;
    const input = { partId: 'SP-001', quantity: 1, operator: '测试员', remark: '测试出库', idempotencyKey: 'idem-stock-001' };
    await service.stockChange('出库', input); await service.stockChange('出库', input);
    expect((await repository.getSparePart('SP-001'))!.currentStock).toBe(before - 1);
    expect((await repository.listSpareTransactions()).filter((item) => item.idempotencyKey === input.idempotencyKey)).toHaveLength(1);
  });
  it('库存不足时拒绝扣减', async () => {
    const repository = new MockRepository(); const service = new OperationsService(repository, new RuleBasedDiagnosisProvider(), new MockNotificationProvider());
    await expect(service.stockChange('出库', { partId: 'SP-004', quantity: 1, operator: '测试员', remark: '测试', idempotencyKey: 'idem-stock-empty' })).rejects.toThrow('库存不足');
  });
});

describe('辅助研判意图数据路由', () => {
  it('不同意图只查询对应业务数据', async () => {
    const repository = new MockRepository();
    const service = new OperationsService(repository, new RuleBasedDiagnosisProvider(), new MockNotificationProvider());
    const equipment = vi.spyOn(repository, 'listEquipment');
    const workOrders = vi.spyOn(repository, 'listWorkOrders');
    const spareParts = vi.spyOn(repository, 'listSpareParts');
    const telemetry = vi.spyOn(repository, 'getTelemetry');

    await service.diagnose(undefined, '当前风险最高的设备是什么？');
    expect(equipment).toHaveBeenCalledOnce();
    expect(workOrders).not.toHaveBeenCalled();
    expect(spareParts).not.toHaveBeenCalled();
    expect(telemetry).not.toHaveBeenCalled();

    vi.clearAllMocks();
    await service.diagnose(undefined, '当前有哪些待处理工单？');
    expect(workOrders).toHaveBeenCalledOnce();
    expect(equipment).not.toHaveBeenCalled();
    expect(spareParts).not.toHaveBeenCalled();

    vi.clearAllMocks();
    await service.diagnose(undefined, '当前备件库存是否满足维修需求？');
    expect(spareParts).toHaveBeenCalledOnce();
    expect(equipment).not.toHaveBeenCalled();
    expect(workOrders).not.toHaveBeenCalled();
  });

  it('设备详情通用问题使用selectedDeviceId而不是返回固定模板', async () => {
    const repository = new MockRepository();
    const service = new OperationsService(repository, new RuleBasedDiagnosisProvider(), new MockNotificationProvider());
    const result = await service.diagnose('IDF-002', '请研判当前设备状态和主要风险');
    expect(result.intent).toBe('equipment_status');
    expect(result.deviceId).toBe('IDF-002');
  });
});

describe('数字孪生工单上下文', () => {
  it('复用预警链路创建包含场景指标的待接单工单', async () => {
    const repository = new MockRepository(); const service = new OperationsService(repository, new RuleBasedDiagnosisProvider(), new MockNotificationProvider());
    const order = await service.createWorkOrderFromAlert('ALT-20260717-001', {
      assignee: '张工', assigneeUserId: 'zhang-gong', idempotencyKey: 'digital-twin-test-001',
      digitalTwinContext: {
        equipmentName: '1号引风机', equipmentId: 'IDF-001', faultPart: '驱动端轴承', faultType: '轴承温升', riskLevel: '高',
        failureProbability: 89, healthScore: 42, temperature: 82, vibration: 5.2, speed: 1472, current: 41,
        diagnosis: '驱动端轴承存在润滑不足、磨损或冷却异常风险', advice: ['24小时内检查润滑和轴承游隙'], createdAt: '2026-07-17T14:00:00.000Z',
      },
    });
    expect(order.status).toBe('待接单');
    expect(order.riskLevel).toBe('高风险');
    expect(order.healthScoreBefore).toBe(42);
    expect(order.faultDescription).toContain('温度 82℃');
    expect(order.faultDescription).toContain('故障概率 89%');
    expect(order.requiredSpareParts.map((part) => part.partName)).toEqual(['风机轴承', '通用润滑油']);
  });

  it('仅高风险工单触发协同卡片且通知失败不回滚工单', async () => {
    const repository = new MockRepository();
    const notifications = new MockNotificationProvider();
    const send = vi.spyOn(notifications, 'sendWorkOrderAlert').mockResolvedValue({ messageId: '', delivered: false, preview: {}, error: 'local simulated delivery failure' });
    const service = new OperationsService(repository, new RuleBasedDiagnosisProvider(), notifications);
    const highRisk = await service.createWorkOrderFromAlert('ALT-20260717-001', {
      assignee: '张工', assigneeUserId: 'zhang-gong', idempotencyKey: 'notify-failure-high-risk',
      digitalTwinContext: {
        equipmentName: '1号引风机', equipmentId: 'IDF-001', faultPart: '驱动端轴承', faultType: '轴承温升', riskLevel: '高',
        failureProbability: 89, healthScore: 42, temperature: 82, vibration: 5.2, speed: 1472, current: 41,
        diagnosis: '存在风险', advice: ['24小时内检查'], createdAt: new Date().toISOString(),
      },
    });
    expect(highRisk.status).toBe('待接单');
    expect(highRisk.notificationStatus).toBe('failed');
    expect(highRisk.source).toBe('digital-twin');
    expect(await repository.getWorkOrder(highRisk.id)).toBeTruthy();
    expect(send).toHaveBeenCalledOnce();
    const duplicate = await service.createWorkOrderFromAlert('ALT-20260717-001', {
      assignee: '张工', assigneeUserId: 'zhang-gong', idempotencyKey: 'notify-failure-high-risk',
    });
    expect(duplicate.id).toBe(highRisk.id);
    expect(send).toHaveBeenCalledOnce();
    const logs = await repository.listOperationLogs(highRisk.workOrderNo);
    expect(logs.some((item) => item.action === '高风险工单卡片发送失败')).toBe(true);
    const warning = await service.createWorkOrderFromAlert('ALT-20260717-002', {
      assignee: '陈工', assigneeUserId: 'chen-gong', idempotencyKey: 'notify-normal-warning',
    });
    expect(warning.riskLevel).toBe('二级预警');
    expect(send).toHaveBeenCalledOnce();
  });

  it('进程重启且Mock预警关联丢失时仍按稳定工单编号避免重复创建和发卡', async () => {
    const repository = new MockRepository();
    const notifications = new MockNotificationProvider();
    const send = vi.spyOn(notifications, 'sendWorkOrderAlert');
    const firstService = new OperationsService(repository, new RuleBasedDiagnosisProvider(), notifications);
    const input = {
      assignee: '张工', assigneeUserId: 'zhang-gong', idempotencyKey: 'serverless-create-first',
      digitalTwinContext: {
        equipmentName: '1号引风机', equipmentId: 'IDF-001', faultPart: '驱动端轴承', faultType: '轴承温升', riskLevel: '高' as const,
        failureProbability: 89, healthScore: 42, temperature: 82, vibration: 5.2, speed: 1472, current: 41,
        diagnosis: '存在风险', advice: ['24小时内检查'], createdAt: new Date().toISOString(),
      },
    };
    const first = await firstService.createWorkOrderFromAlert('ALT-20260717-001', input);
    await repository.updateAlert('ALT-20260717-001', { relatedWorkOrderId: undefined });

    const restartedService = new OperationsService(repository, new RuleBasedDiagnosisProvider(), notifications);
    const second = await restartedService.createWorkOrderFromAlert('ALT-20260717-001', { ...input, idempotencyKey: 'serverless-create-retry' });
    expect(second.workOrderNo).toBe(first.workOrderNo);
    expect((await repository.listWorkOrders()).filter((item) => item.workOrderNo === first.workOrderNo)).toHaveLength(1);
    expect(send).toHaveBeenCalledOnce();
  });
});
