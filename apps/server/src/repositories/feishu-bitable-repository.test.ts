import { createMockData } from '@fengsui/shared';
import { describe, expect, it, vi } from 'vitest';
import { buildFeishuCapabilities } from '../config/env.js';
import { AppError } from '../middleware/errors.js';
import { FeishuIntegrationState } from '../services/feishu-integration-state.js';
import { FeishuBitableRepository, fromFeishuWorkOrderFields, toFeishuWorkOrderFields } from './feishu-bitable-repository.js';

const partialCapabilities = buildFeishuCapabilities({
  FEISHU_APP_ID: 'configured-app-id',
  FEISHU_APP_SECRET: 'configured-app-secret',
  FEISHU_BITABLE_APP_TOKEN: 'configured-app-token',
  FEISHU_WORK_ORDER_TABLE_ID: 'configured-work-order-table',
}, 'feishu');

describe('飞书多维表格混合 Repository', () => {
  it('工单使用八个中文字段并将创建时间写为毫秒时间戳', async () => {
    const createRecord = vi.fn(async (_appToken: string, _tableId: string, fields: Record<string, unknown>) => ({ record: { record_id: 'rec-test-work-order', fields } }));
    const client = { listRecords: vi.fn(async () => []), createRecord, updateRecord: vi.fn(async () => ({})), getRecord: vi.fn() };
    const repository = new FeishuBitableRepository({
      client,
      appToken: 'configured-app-token',
      tableIds: { workOrders: 'configured-work-order-table' },
      capabilities: partialCapabilities,
    });
    const order = createMockData().workOrders[0]!;

    const created = await repository.createWorkOrder(order);

    const fields = createRecord.mock.calls[0]![2];
    expect(Object.keys(fields)).toEqual(['工单编号', '设备名称', '设备编号', '故障部位', '故障类型', '风险等级', '工单状态', '创建时间']);
    expect(fields.工单编号).toBe(order.workOrderId);
    expect(fields.创建时间).toBe(Date.parse(order.createdTime));
    expect(typeof fields.创建时间).toBe('number');
    expect(created.recordId).toBe('rec-test-work-order');
    expect(created.id).toBe(order.id);
    expect(created.workOrderNo).toBe(order.workOrderNo);
  });

  it('创建前按“工单编号”精确查重，命中后不重复创建', async () => {
    const order = createMockData().workOrders[0]!;
    const record = { record_id: 'rec-existing-work-order', fields: toFeishuWorkOrderFields(order) };
    const searchRecords = vi.fn(async () => [record]);
    const createRecord = vi.fn();
    const repository = new FeishuBitableRepository({
      client: { searchRecords, listRecords: vi.fn(), createRecord, updateRecord: vi.fn(), getRecord: vi.fn() },
      appToken: 'configured-app-token', tableIds: { workOrders: 'configured-work-order-table' }, capabilities: partialCapabilities,
    });
    await expect(repository.createWorkOrder(order)).resolves.toMatchObject({ recordId: 'rec-existing-work-order', workOrderNo: order.workOrderNo });
    expect(searchRecords).toHaveBeenCalledWith('configured-app-token', 'configured-work-order-table', '工单编号', order.workOrderNo);
    expect(createRecord).not.toHaveBeenCalled();
  });

  it('未配置设备表时设备模块继续使用 Mock，且不访问飞书', async () => {
    const listRecords = vi.fn(async () => []);
    const repository = new FeishuBitableRepository({
      client: { listRecords, createRecord: vi.fn(async () => ({ record: { record_id: 'unused', fields: {} } })), updateRecord: vi.fn(async () => ({})), getRecord: vi.fn() },
      appToken: 'configured-app-token',
      tableIds: { workOrders: 'configured-work-order-table' },
      capabilities: partialCapabilities,
    });

    expect(await repository.listEquipment()).toHaveLength(12);
    expect(listRecords).not.toHaveBeenCalled();
  });

  it('飞书工单日期字段可按毫秒时间戳往返解析', () => {
    const order = createMockData().workOrders[0]!;
    const fields = toFeishuWorkOrderFields(order);
    const restored = fromFeishuWorkOrderFields(fields);
    expect(restored.workOrderId).toBe(order.workOrderId);
    expect(restored.workOrderNo).toBe(order.workOrderNo);
    expect(restored.id).toBe(order.id);
    expect(restored.createdTime).toBe(new Date(Date.parse(order.createdTime)).toISOString());
  });

  it('更新成功后使用已定位的 record_id 读取单条记录', async () => {
    const order = { ...createMockData().workOrders[0]!, id: 'WO-20260718-001', workOrderNo: 'WO-20260718-001', workOrderId: 'WO-20260718-001', status: '待接单' as const };
    const fields = toFeishuWorkOrderFields(order);
    const listRecords = vi.fn(async () => [{ record_id: 'rec-work-order-001', fields }]);
    const updateRecord = vi.fn(async () => ({}));
    const getRecord = vi.fn(async () => ({ record: { record_id: 'rec-work-order-001', fields: { ...fields, 工单状态: '已接单' } } }));
    const repository = new FeishuBitableRepository({
      client: { listRecords, createRecord: vi.fn(), updateRecord, getRecord },
      appToken: 'configured-app-token',
      tableIds: { workOrders: 'configured-work-order-table' },
      capabilities: partialCapabilities,
    });

    const updated = await repository.updateWorkOrder(order.workOrderId, { status: '已接单' });

    expect(updateRecord).toHaveBeenCalledWith('configured-app-token', 'configured-work-order-table', 'rec-work-order-001', expect.objectContaining({ 工单编号: order.workOrderId, 工单状态: '已接单' }));
    expect(getRecord).toHaveBeenCalledWith('configured-app-token', 'configured-work-order-table', 'rec-work-order-001');
    expect(listRecords).toHaveBeenCalledTimes(1);
    expect(updated.status).toBe('已接单');
    expect(updated.syncStatus).toBe('synced');
    expect(updated.recordId).toBe('rec-work-order-001');
  });

  it('使用 recordId 更新时直接读取和更新单条记录，不执行全表搜索', async () => {
    const order = { ...createMockData().workOrders[0]!, id: 'internal-work-order-001', workOrderNo: 'WO-20260718-101', workOrderId: 'WO-20260718-101', status: '待接单' as const };
    let fields = toFeishuWorkOrderFields(order);
    const listRecords = vi.fn(async () => []);
    const updateRecord = vi.fn(async (_token: string, _tableId: string, _recordId: string, nextFields: Record<string, unknown>) => {
      fields = nextFields;
      return {};
    });
    const getRecord = vi.fn(async () => ({ record: { record_id: 'rec-direct-101', fields } }));
    const repository = new FeishuBitableRepository({
      client: { listRecords, createRecord: vi.fn(), updateRecord, getRecord },
      appToken: 'configured-app-token',
      tableIds: { workOrders: 'configured-work-order-table' },
      capabilities: partialCapabilities,
    });

    const updated = await repository.updateWorkOrder('rec-direct-101', { status: '已接单' });

    expect(updated).toMatchObject({ id: 'WO-20260718-101', workOrderNo: 'WO-20260718-101', recordId: 'rec-direct-101', status: '已接单' });
    expect(updateRecord).toHaveBeenCalledWith('configured-app-token', 'configured-work-order-table', 'rec-direct-101', expect.objectContaining({ 工单状态: '已接单' }));
    expect(listRecords).not.toHaveBeenCalled();
  });

  it('更新已成功但按 record_id 回读失败时仍返回成功状态', async () => {
    const order = { ...createMockData().workOrders[0]!, id: 'WO-20260718-001', workOrderNo: 'WO-20260718-001', workOrderId: 'WO-20260718-001', status: '待接单' as const };
    const listRecords = vi.fn(async () => [{ record_id: 'rec-work-order-001', fields: toFeishuWorkOrderFields(order) }]);
    const updateRecord = vi.fn(async () => ({}));
    const getRecord = vi.fn(async () => { throw new Error('飞书读取暂时不可用'); });
    const repository = new FeishuBitableRepository({
      client: { listRecords, createRecord: vi.fn(), updateRecord, getRecord },
      appToken: 'configured-app-token',
      tableIds: { workOrders: 'configured-work-order-table' },
      capabilities: partialCapabilities,
    });

    const updated = await repository.updateWorkOrder(order.workOrderId, { status: '已接单' });

    expect(updateRecord).toHaveBeenCalledTimes(1);
    expect(updated).toMatchObject({ workOrderId: order.workOrderId, status: '已接单', syncStatus: 'pending', syncMessage: '数据同步刷新中' });
  });

  it('创建时间缺失时仍映射完整工单而不是过滤记录', () => {
    const restored = fromFeishuWorkOrderFields({
      工单编号: 'WO-20260718-001',
      设备名称: '1号引风机',
      设备编号: 'IDF-001',
      故障部位: '轴承',
      故障类型: '振动升高',
      风险等级: '预警',
      工单状态: '已接单',
    });

    expect(restored.workOrderId).toBe('WO-20260718-001');
    expect(restored.workOrderNo).toBe('WO-20260718-001');
    expect(restored.status).toBe('已接单');
    expect(Number.isNaN(Date.parse(restored.createdTime))).toBe(false);
  });

  it('工单确实不存在时返回未找到且不调用更新接口', async () => {
    const updateRecord = vi.fn();
    const repository = new FeishuBitableRepository({
      client: { listRecords: vi.fn(async () => []), createRecord: vi.fn(), updateRecord, getRecord: vi.fn() },
      appToken: 'configured-app-token',
      tableIds: { workOrders: 'configured-work-order-table' },
      capabilities: partialCapabilities,
    });

    await expect(repository.updateWorkOrder('WO-NOT-EXISTS', { status: '已接单' })).rejects.toMatchObject({ status: 404, code: 'WORK_ORDER_NOT_FOUND' });
    expect(updateRecord).not.toHaveBeenCalled();
  });

  it('飞书凭证失效时读取降级为演示数据且写入明确标记为同步失败', async () => {
    const integrationState = new FeishuIntegrationState(true);
    const createRecord = vi.fn();
    const repository = new FeishuBitableRepository({
      client: {
        listRecords: vi.fn(async () => { throw new AppError(502, 'FEISHU_AUTH_INVALID', '飞书应用凭证无效'); }),
        createRecord,
        updateRecord: vi.fn(),
        getRecord: vi.fn(),
      },
      appToken: 'configured-app-token',
      tableIds: { workOrders: 'configured-work-order-table' },
      capabilities: partialCapabilities,
      integrationState,
    });

    const fallbackRows = await repository.listWorkOrders();
    expect(fallbackRows.length).toBeGreaterThan(0);
    expect(integrationState.snapshot()).toMatchObject({ authenticated: false, safeErrorCode: 'FEISHU_AUTH_INVALID' });
    await expect(repository.createWorkOrder(createMockData().workOrders[0]!)).resolves.toMatchObject({
      syncStatus: 'failed',
      syncErrorCode: 'FEISHU_AUTH_UNAVAILABLE',
    });
    expect(createRecord).not.toHaveBeenCalled();
  });

  it('用户重新同步时会重新探测远端并恢复为已同步', async () => {
    const integrationState = new FeishuIntegrationState(true);
    let unavailable = true;
    const order = { ...createMockData().workOrders[0]!, workOrderNo: 'WO-RESYNC-001', workOrderId: 'WO-RESYNC-001', id: 'WO-RESYNC-001' };
    const searchRecords = vi.fn(async () => {
      if (unavailable) throw new AppError(503, 'FEISHU_AUTH_UNAVAILABLE', 'network unavailable');
      return [];
    });
    const createRecord = vi.fn(async (_token: string, _table: string, fields: Record<string, unknown>) => ({ record: { record_id: 'rec_resynced', fields } }));
    const repository = new FeishuBitableRepository({
      client: { searchRecords, listRecords: vi.fn(async () => []), createRecord, updateRecord: vi.fn(), getRecord: vi.fn() },
      appToken: 'configured-app-token', tableIds: { workOrders: 'configured-work-order-table' }, capabilities: partialCapabilities, integrationState,
    });
    const failed = await repository.createWorkOrder(order);
    expect(failed.syncStatus).toBe('failed');
    unavailable = false;
    await expect(repository.resyncWorkOrder(order.id)).resolves.toMatchObject({ recordId: 'rec_resynced', syncStatus: 'synced' });
    expect(createRecord).toHaveBeenCalledOnce();
  });
});
