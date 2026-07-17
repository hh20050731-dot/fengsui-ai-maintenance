import { createMockData } from '@fengsui/shared';
import { feishu, requireEnv, serializeFields } from './feishu-api.js';

const dryRun = process.env.DRY_RUN !== 'false'; const appToken = requireEnv('FEISHU_BITABLE_APP_TOKEN'); const mock = createMockData();
const targets = [
  { name: 'Equipment', env: 'FEISHU_EQUIPMENT_TABLE_ID', key: 'deviceId', rows: mock.equipment },
  { name: 'Telemetry', env: 'FEISHU_TELEMETRY_TABLE_ID', key: 'recordKey', rows: Object.values(mock.telemetry).flatMap((points) => points.slice(-8).map((point) => ({ ...point, recordKey: `${point.deviceId}-${point.timestamp}` }))) },
  { name: 'HealthSnapshots', env: 'FEISHU_HEALTH_TABLE_ID', key: 'snapshotId', rows: mock.equipment.map((device) => ({ snapshotId: `${device.deviceId}-${device.updatedAt}`, deviceId: device.deviceId, timestamp: device.updatedAt, healthScore: device.healthScore, riskLevel: device.riskLevel, operatingCondition: device.operatingCondition, indicatorContributions: {}, modelVersion: 'competition-rule-v1' })) },
  { name: 'Alerts', env: 'FEISHU_ALERT_TABLE_ID', key: 'alertId', rows: mock.alerts },
  { name: 'WorkOrders', env: 'FEISHU_WORK_ORDER_TABLE_ID', key: 'workOrderId', rows: mock.workOrders },
  { name: 'SpareParts', env: 'FEISHU_SPARE_PART_TABLE_ID', key: 'partId', rows: mock.spareParts },
  { name: 'KnowledgeBase', env: 'FEISHU_KNOWLEDGE_TABLE_ID', key: 'knowledgeId', rows: mock.knowledge },
  { name: 'OperationLogs', env: 'FEISHU_OPERATION_LOG_TABLE_ID', key: 'logId', rows: mock.operationLogs },
] as const;

async function main() {
  console.log(`烽燧演示数据写入：${dryRun ? 'DRY_RUN（只检查）' : '执行模式'}`);
  for (const target of targets) {
    const tableId = requireEnv(target.env);
    const remote = await feishu<{ items?: Array<{ fields: Record<string, unknown> }> }>(`/bitable/v1/apps/${appToken}/tables/${tableId}/records?page_size=500`);
    const existing = new Set((remote.items ?? []).map((record) => String(record.fields[target.key] ?? '')));
    let created = 0; let skipped = 0;
    for (const raw of target.rows as readonly Record<string, unknown>[]) {
      const value = String(raw[target.key]);
      if (existing.has(value)) { skipped++; continue; }
      if (!dryRun) await feishu(`/bitable/v1/apps/${appToken}/tables/${tableId}/records`, { method: 'POST', body: JSON.stringify({ fields: serializeFields(raw) }) });
      created++;
    }
    console.log(`[${target.name}] 已存在跳过 ${skipped}，${dryRun ? '计划新增' : '实际新增'} ${created}`);
  }
  console.log('完成：未删除或覆盖任何已有记录，可安全重复执行。');
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
