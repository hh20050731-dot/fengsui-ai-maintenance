import {
  createInspectionSchema,
  type CreateInspectionInput,
} from '@fengsui/shared';
import { describe, expect, it, vi } from 'vitest';
import { RuleBasedDiagnosisProvider } from '../providers/ai-diagnosis-provider.js';
import { MockNotificationProvider } from '../providers/notification-provider.js';
import { MockRepository } from '../repositories/mock-repository.js';
import { InspectionService } from './inspection-service.js';
import { OperationsService } from './operations-service.js';

function createFixture() {
  const repository = new MockRepository();
  const notifications = new MockNotificationProvider();
  const operations = new OperationsService(
    repository,
    new RuleBasedDiagnosisProvider(),
    notifications,
  );
  const inspections = new InspectionService(repository, operations);
  return { inspections, notifications, operations, repository };
}

function normalInput(
  idempotencyKey = 'inspection-normal-001',
): CreateInspectionInput {
  return {
    deviceId: 'CWP-001',
    inspectorName: '测试巡检员',
    inspectorUserId: 'test-inspector',
    runningStatus: '运行',
    vibration: 2.5,
    temperature: 60,
    pressure: 0.64,
    current: 69,
    abnormalDescription: '',
    imageUrls: ['https://example.com/inspection/cwp-001.png'],
    riskLevel: '正常',
    aiSummary: '现场图片未发现明显异常，仍需按规程人工确认。',
    aiRecommendManualInspection: false,
    isAbnormal: false,
    status: '已提交',
    source: 'miaoda',
    idempotencyKey,
  };
}

function abnormalInput(
  idempotencyKey = 'inspection-abnormal-001',
): CreateInspectionInput {
  return {
    ...normalInput(idempotencyKey),
    vibration: 6.2,
    temperature: 88,
    abnormalDescription: '轴承区域振动明显并伴随温升。',
    riskLevel: '预警',
    aiSummary: '多模态辅助研判建议检查轴承与润滑状态。',
    aiRecommendManualInspection: true,
    isAbnormal: true,
  };
}

describe('巡检记录持久化与幂等', () => {
  it('创建巡检记录并可从 Repository 重新读取', async () => {
    const { inspections, repository } = createFixture();
    const created = await inspections.create(normalInput());
    expect(created.inspectionId).toMatch(/^INS-/u);
    expect(created.saveMode).toBe('local_repository');
    expect(await repository.getInspection(created.inspectionId)).toEqual(created);
    expect(await inspections.list()).toHaveLength(1);
  });

  it('重复提交相同幂等键不会创建第二条巡检', async () => {
    const { inspections } = createFixture();
    const first = await inspections.create(normalInput('inspection-idem-001'));
    const second = await inspections.create(normalInput('inspection-idem-001'));
    expect(second.inspectionId).toBe(first.inspectionId);
    expect(await inspections.list()).toHaveLength(1);
  });

  it('正常巡检不会自动生成预警且显式生成请求会被拒绝', async () => {
    const { inspections } = createFixture();
    const record = await inspections.create(normalInput());
    expect(record.alertRecommended).toBe(false);
    await expect(inspections.createAlert(record.inspectionId, {
      operator: '测试巡检员',
      idempotencyKey: 'normal-alert-attempt',
    })).rejects.toMatchObject({ code: 'INSPECTION_ALERT_NOT_RECOMMENDED' });
  });
});

describe('巡检异常到预警和工单', () => {
  it('异常巡检生成真实 Alert 并保持单巡检单预警', async () => {
    const { inspections, repository } = createFixture();
    const record = await inspections.create(abnormalInput());
    expect(record.alertRecommended).toBe(true);
    const first = await inspections.createAlert(record.inspectionId, {
      operator: '测试巡检员',
      idempotencyKey: 'inspection-alert-001',
    });
    const second = await inspections.createAlert(record.inspectionId, {
      operator: '测试巡检员',
      idempotencyKey: 'inspection-alert-002',
    });
    expect(first.alert.sourceInspectionId).toBe(record.inspectionId);
    expect(first.alert.confidence).toBe(0);
    expect(second.alert.alertId).toBe(first.alert.alertId);
    expect((await repository.listAlerts()).filter(
      (item) => item.sourceInspectionId === record.inspectionId,
    )).toHaveLength(1);
  });

  it('从巡检创建工单并保存 inspectionId、alertId 关联', async () => {
    const { inspections, repository } = createFixture();
    const record = await inspections.create(abnormalInput());
    const result = await inspections.createWorkOrder(record.inspectionId, {
      assignee: '测试巡检员',
      assigneeUserId: 'test-inspector',
      operator: '测试巡检员',
      idempotencyKey: 'inspection-order-001',
    });
    expect(result.workOrder.sourceInspectionId).toBe(record.inspectionId);
    expect(result.workOrder.sourceAlertId).toBe(result.alert.alertId);
    expect(result.inspection.workOrderId).toBe(result.workOrder.workOrderNo);
    expect(await repository.getWorkOrder(result.workOrder.workOrderNo)).toBeTruthy();
  });

  it('同一巡检重复创建工单返回已有工单', async () => {
    const { inspections, repository } = createFixture();
    const record = await inspections.create(abnormalInput());
    const first = await inspections.createWorkOrder(record.inspectionId, {
      assignee: '测试巡检员',
      assigneeUserId: 'test-inspector',
      operator: '测试巡检员',
      idempotencyKey: 'inspection-order-idem-001',
    });
    const second = await inspections.createWorkOrder(record.inspectionId, {
      assignee: '测试巡检员',
      assigneeUserId: 'test-inspector',
      operator: '测试巡检员',
      idempotencyKey: 'inspection-order-idem-002',
    });
    expect(second.workOrder.workOrderNo).toBe(first.workOrder.workOrderNo);
    expect((await repository.listWorkOrders()).filter(
      (item) => item.sourceInspectionId === record.inspectionId,
    )).toHaveLength(1);
  });

  it('通知群未配置时工单仍成功并标记 not_requested', async () => {
    const { inspections, notifications, repository } = createFixture();
    vi.spyOn(notifications, 'sendWorkOrderAlert').mockResolvedValue({
      messageId: '',
      delivered: false,
      preview: {},
      error: '未配置通知会话 ID',
    });
    const record = await inspections.create(abnormalInput());
    const result = await inspections.createWorkOrder(record.inspectionId, {
      assignee: '测试巡检员',
      assigneeUserId: 'test-inspector',
      operator: '测试巡检员',
      idempotencyKey: 'inspection-no-chat-001',
    });
    expect(result.workOrder.notificationStatus).toBe('not_requested');
    expect(result.workOrder.notificationMessage).toContain('通知群未配置');
    expect(await repository.getWorkOrder(result.workOrder.workOrderNo)).toBeTruthy();
  });

  it('配置通知通道时发送卡片并在工单推进后更新原卡片', async () => {
    const { inspections, notifications, operations } = createFixture();
    const send = vi.spyOn(notifications, 'sendWorkOrderAlert');
    const update = vi.spyOn(notifications, 'updateCard');
    const record = await inspections.create(abnormalInput());
    const result = await inspections.createWorkOrder(record.inspectionId, {
      assignee: '测试巡检员',
      assigneeUserId: 'test-inspector',
      operator: '测试巡检员',
      idempotencyKey: 'inspection-card-001',
    });
    expect(send).toHaveBeenCalledOnce();
    expect(result.workOrder.notificationStatus).toBe('sent');
    expect(result.workOrder.feishuMessageId).toBeTruthy();
    const accepted = await operations.transitionWorkOrder(result.workOrder.workOrderNo, {
      targetStatus: '已接单',
      operator: '测试巡检员',
      note: '移动端接单',
      idempotencyKey: 'inspection-card-accept-001',
    });
    expect(accepted.status).toBe('已接单');
    expect(update).toHaveBeenCalledOnce();
  });
});

describe('巡检图片输入安全', () => {
  it('接受 HTTPS 图片资源地址并拒绝 Base64 和超量附件', () => {
    expect(createInspectionSchema.safeParse(normalInput()).success).toBe(true);
    expect(createInspectionSchema.safeParse({
      ...normalInput(),
      imageUrls: ['data:image/png;base64,AAAA'],
    }).success).toBe(false);
    expect(createInspectionSchema.safeParse({
      ...normalInput(),
      imageUrls: Array.from(
        { length: 9 },
        (_, index) => `https://example.com/inspection/${index}.png`,
      ),
    }).success).toBe(false);
  });
});
