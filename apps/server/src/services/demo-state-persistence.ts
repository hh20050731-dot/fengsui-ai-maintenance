import {
  acknowledgeAlertSchema,
  createWorkOrderSchema,
  demoJournalSchema,
  equipmentInputSchema,
  stockChangeSchema,
  transitionWorkOrderSchema,
  workOrderRecordSchema,
  type DemoJournalEntry,
} from '@fengsui/shared';
import { z } from 'zod';
import { AppError } from '../middleware/errors.js';
import type { MockRepository } from '../repositories/mock-repository.js';
import type { OperationsService } from './operations-service.js';

export const DEMO_JOURNAL_HEADER = 'x-fengsui-demo-journal';
export const APP_MODE_HEADER = 'x-fengsui-mode';
const replayCreateWorkOrderSchema = createWorkOrderSchema.extend({ sourceAlertId: z.string().min(1) });

export function encodeDemoJournal(entries: DemoJournalEntry[]) {
  return Buffer.from(JSON.stringify(entries), 'utf8').toString('base64url');
}

export class DemoStatePersistence {
  constructor(private repository: MockRepository, private service: OperationsService) {}

  async restore(encodedJournal: string) {
    this.repository.reset();
    this.service.resetTransientState();
    const entries = this.decode(encodedJournal);
    for (const entry of entries) await this.replay(entry);
  }

  reset() {
    this.repository.reset();
    this.service.resetTransientState();
  }

  private decode(encodedJournal: string) {
    try {
      const decoded = Buffer.from(encodedJournal, 'base64url').toString('utf8');
      if (Buffer.byteLength(decoded, 'utf8') > 24_000) throw new Error('journal is too large');
      return demoJournalSchema.parse(JSON.parse(decoded)) as DemoJournalEntry[];
    } catch {
      throw new AppError(400, 'INVALID_DEMO_STATE', '浏览器中的演示状态无效，请在系统设置中重置演示数据');
    }
  }

  private async replay(entry: DemoJournalEntry) {
    const equipmentMatch = entry.path.match(/^\/equipment\/([^/]+)$/);
    const alertMatch = entry.path.match(/^\/alerts\/([^/]+)\/(acknowledge|false-positive|create-work-order)$/);
    const orderMatch = entry.path.match(/^\/work-orders\/([^/]+)\/(transition|record|verify)$/);

    if (entry.method === 'POST' && entry.path === '/equipment') {
      await this.service.createEquipment(equipmentInputSchema.parse(entry.body));
      return;
    }
    if (entry.method === 'PATCH' && equipmentMatch) {
      await this.repository.updateEquipment(decodeURIComponent(equipmentMatch[1]!), equipmentInputSchema.partial().parse(entry.body));
      return;
    }
    if (entry.method === 'POST' && alertMatch) {
      const alertId = decodeURIComponent(alertMatch[1]!);
      if (alertMatch[2] === 'acknowledge') {
        const body = acknowledgeAlertSchema.parse(entry.body);
        await this.repository.updateAlert(alertId, { alertStatus: '已确认', acknowledgedBy: body.operator, acknowledgedAt: new Date().toISOString() });
        return;
      }
      if (alertMatch[2] === 'false-positive') {
        const body = acknowledgeAlertSchema.parse(entry.body);
        await this.repository.updateAlert(alertId, { alertStatus: '误报', acknowledgedBy: body.operator, acknowledgedAt: new Date().toISOString(), closedAt: new Date().toISOString() });
        return;
      }
      const body = createWorkOrderSchema.parse(entry.body);
      await this.service.createWorkOrderFromAlert(alertId, { ...body, replayWorkOrderId: entry.resultId });
      return;
    }
    if (entry.method === 'POST' && entry.path === '/work-orders') {
      const replayBody = replayCreateWorkOrderSchema.parse(entry.body);
      const alertId = z.string().min(1).parse(replayBody.sourceAlertId);
      const body = createWorkOrderSchema.parse(replayBody);
      await this.service.createWorkOrderFromAlert(alertId, { ...body, replayWorkOrderId: entry.resultId });
      return;
    }
    if (entry.method === 'POST' && orderMatch) {
      const orderId = decodeURIComponent(orderMatch[1]!);
      if (orderMatch[2] === 'record') {
        await this.service.addWorkOrderRecord(orderId, workOrderRecordSchema.parse(entry.body));
        return;
      }
      const body = transitionWorkOrderSchema.parse(orderMatch[2] === 'verify' ? { ...(entry.body as object), targetStatus: '已完成' } : entry.body);
      await this.service.transitionWorkOrder(orderId, body);
      return;
    }
    if (entry.method === 'POST' && (entry.path === '/spare-parts/inbound' || entry.path === '/spare-parts/outbound')) {
      await this.service.stockChange(entry.path.endsWith('/inbound') ? '入库' : '出库', stockChangeSchema.parse(entry.body));
      return;
    }
    throw new AppError(400, 'UNSUPPORTED_DEMO_ACTION', `无法恢复演示操作：${entry.method} ${entry.path}`);
  }
}
