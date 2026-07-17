import { readFile } from 'node:fs/promises';
import { feishu, requireEnv } from './feishu-api.js';

interface TableSchema { name: string; description: string; primaryKey: string; fields: Array<[string, number]> }
interface Schema { tables: TableSchema[] }
const dryRun = process.env.DRY_RUN !== 'false';
const appToken = requireEnv('FEISHU_BITABLE_APP_TOKEN');
const schema = JSON.parse(await readFile(new URL('../config/bitable-schema.json', import.meta.url), 'utf8')) as Schema;

async function main() {
  console.log(`烽燧多维表格初始化：${dryRun ? 'DRY_RUN（只检查，不写入）' : '执行模式'}`);
  const tableData = await feishu<{ items?: Array<{ table_id: string; name: string }> }>(`/bitable/v1/apps/${appToken}/tables?page_size=100`);
  const tables = tableData.items ?? [];
  for (const definition of schema.tables) {
    let table = tables.find((item) => item.name === definition.name);
    if (!table) {
      console.log(`[缺失表] ${definition.name}`);
      if (dryRun) continue;
      const created = await feishu<{ table_id: string }>(`/bitable/v1/apps/${appToken}/tables`, { method: 'POST', body: JSON.stringify({ table: { name: definition.name } }) });
      table = { table_id: created.table_id, name: definition.name }; tables.push(table);
      console.log(`[已创建表] ${definition.name} -> ${table.table_id}`);
    } else console.log(`[已存在表] ${definition.name} -> ${table.table_id}`);
    const fieldData = await feishu<{ items?: Array<{ field_id: string; field_name: string }> }>(`/bitable/v1/apps/${appToken}/tables/${table.table_id}/fields?page_size=100`);
    const names = new Set((fieldData.items ?? []).map((item) => item.field_name));
    for (const [fieldName, type] of definition.fields) {
      if (names.has(fieldName)) continue;
      console.log(`  [缺失字段] ${fieldName}`);
      if (!dryRun) await feishu(`/bitable/v1/apps/${appToken}/tables/${table.table_id}/fields`, { method: 'POST', body: JSON.stringify({ field_name: fieldName, type }) });
    }
  }
  console.log(dryRun ? '检查完成。设置 DRY_RUN=false 后再次执行可创建缺失表/字段。' : '初始化完成。脚本未删除、重命名或覆盖任何已有数据。');
  console.log('请将输出的 table_id 填入 .env 对应 FEISHU_*_TABLE_ID 变量。');
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
