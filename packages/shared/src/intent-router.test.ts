import { describe, expect, it } from 'vitest';
import { IntentRouter } from './intent-router.js';

describe('IntentRouter', () => {
  it.each([
    '创建1号引风机演示工单',
    '生成1号引风机维修工单',
    '给1号引风机建一个工单',
    '发送IDF-001工单卡片',
    '为1号引风机创建工单',
    '1号引风机创建演示工单',
  ])('将创建工单说法“%s”稳定路由为CREATE_DEMO_WORK_ORDER', (question) => {
    expect(new IntentRouter().route(question).intent).toBe('CREATE_DEMO_WORK_ORDER');
  });

  it.each([
    ['当前风险最高的设备是什么？', 'highest_risk_equipment'],
    ['当前有哪些高风险设备？', 'high_risk_equipment_list'],
    ['1号引风机当前状态如何？', 'equipment_status'],
    ['最近哪些指标异常？', 'abnormal_metrics'],
    ['当前有哪些待处理工单？', 'pending_work_orders'],
    ['当前备件库存是否满足维修需求？', 'spare_part_availability'],
    ['哪台设备应该优先检修？', 'maintenance_priority'],
    ['为什么判断1号引风机存在轴承温升风险？', 'diagnosis_reason'],
    ['今天天气怎么样？', 'unsupported_or_ambiguous'],
  ] as const)('将“%s”路由为%s', (question, expected) => {
    expect(new IntentRouter().route(question).intent).toBe(expected);
  });

  it('设备详情中的通用研判问题使用已选择设备上下文', () => {
    expect(new IntentRouter().route('请研判当前设备状态和主要风险', 'IDF-001').intent).toBe('equipment_status');
    expect(new IntentRouter().route('今天天气怎么样？', 'IDF-001').intent).toBe('unsupported_or_ambiguous');
  });

  it.each([
    '查询1号引风机状态',
    '查看1号引风机状态',
    '1号引风机当前状态如何',
    '1号引风机现在怎么样',
    '1号引风机健康度',
    '一号引风机状态',
    'IDF-001状态',
    '查询一下1号引风机',
    '1号引风机有没有异常',
  ])('将设备状态说法“%s”稳定路由为equipment_status', (question) => {
    expect(new IntentRouter().route(question).intent).toBe('equipment_status');
  });
});
