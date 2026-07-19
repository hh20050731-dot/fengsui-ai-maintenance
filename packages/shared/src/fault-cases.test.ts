import { describe, expect, it } from 'vitest';
import { faultCases } from './fault-cases.js';
import { createMockEquipment } from './mock.js';

describe('比赛最终成品领域数据', () => {
  it('包含指定的12台设备和统一追溯字段', () => {
    const equipment = createMockEquipment();
    expect(equipment.map((item) => item.deviceId)).toEqual([
      'IDF-001', 'IDF-002', 'CWP-001', 'CWP-002', 'FWP-001', 'FWP-002',
      'GRB-001', 'PAF-001', 'SAF-001', 'CLP-001', 'ACP-001', 'LCP-001',
    ]);
    for (const item of equipment) {
      expect(item.trend24h?.length).toBeGreaterThan(0);
      expect(item.trend7d?.length).toBeGreaterThan(0);
      expect(item.trend30d?.length).toBeGreaterThan(0);
      expect(item.riskContributions?.length).toBeGreaterThan(0);
      expect(item.recentAlertIds).toBeDefined();
      expect(item.historicalWorkOrderIds).toBeDefined();
      expect(item.maintenanceRecordIds).toBeDefined();
      expect(item.recommendedMaintenanceAt).toBeTruthy();
      expect(item.modelType).toBeTruthy();
    }
  });

  it('包含10个完整、可解释、明确标注边界的故障案例', () => {
    expect(faultCases).toHaveLength(10);
    expect(new Set(faultCases.map((item) => item.title))).toEqual(new Set([
      '引风机轴承过热', '引风机叶轮不平衡', '引风机联轴器不对中', '给水泵汽蚀',
      '给水泵机械密封泄漏', '循环水泵叶轮堵塞', '循环水泵出口压力下降',
      '炉排减速机润滑不足', '空压机排气压力异常', '渗滤液泵堵塞或过载',
    ]));
    for (const item of faultCases) {
      expect(item.phases.map((phase) => phase.phase)).toEqual(['正常阶段', '异常演变', '首次预警', '维修反馈']);
      expect(item.riskContributions.length).toBeGreaterThan(0);
      expect(item.agentTools.length).toBeGreaterThan(0);
      expect(item.locatorNode).toBeTruthy();
      expect(item.knowledgeOutcome).toBeTruthy();
      expect(item.dataBoundary).toContain('模拟数据');
    }
  });
});
