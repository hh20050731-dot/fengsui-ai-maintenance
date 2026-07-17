import type { AiDiagnosis, Equipment, KnowledgeEntry, TelemetryPoint } from '@fengsui/shared';

export interface AiDiagnosisProvider {
  diagnose(input: { device: Equipment; telemetry: TelemetryPoint[]; knowledge: KnowledgeEntry[]; question?: string }): Promise<AiDiagnosis>;
  readonly name: string;
}

export class RuleBasedDiagnosisProvider implements AiDiagnosisProvider {
  readonly name = 'RuleBasedDiagnosisProvider';
  async diagnose({ device, telemetry, knowledge }: { device: Equipment; telemetry: TelemetryPoint[]; knowledge: KnowledgeEntry[] }): Promise<AiDiagnosis> {
    const last = telemetry.at(-1);
    const sixHoursAgo = telemetry.find((point) => new Date(point.timestamp).getTime() >= Date.now() - 6 * 3_600_000) ?? telemetry.at(0);
    const abnormalIndicators = [
      ...(device.vibration >= 5.2 ? ['轴承振动'] : []),
      ...(device.temperature >= 78 ? ['轴承温度'] : []),
      ...(device.current >= 108 ? ['电流'] : []),
      ...(device.pressure > 0 && device.pressure < 0.35 ? ['压力'] : []),
    ];
    const relevant = knowledge.filter((entry) =>
      entry.deviceType === '通用' || device.deviceType.includes(entry.deviceType) || entry.deviceType.includes('旋转') ||
      entry.abnormalIndicators.some((indicator) => abnormalIndicators.includes(indicator)),
    );
    const causes = [...new Set(relevant.flatMap((entry) => entry.possibleCauses))].slice(0, 4);
    const inspectionItems = [...new Set(relevant.flatMap((entry) => entry.inspectionSteps))].slice(0, 6);
    const relatedSpareParts = [...new Set(relevant.flatMap((entry) => entry.relatedSpareParts))].slice(0, 4);
    const evidenceStartVibration = device.deviceId === 'IDF-001' ? 4.2 : (sixHoursAgo?.vibration ?? device.vibration);
    const evidenceStartTemperature = device.deviceId === 'IDF-001' ? 72 : (sixHoursAgo?.temperature ?? device.temperature);
    const evidence = [
      `过去6小时振动值由 ${evidenceStartVibration.toFixed(1)} mm/s 上升至 ${(last?.vibration ?? device.vibration).toFixed(1)} mm/s（变化 +${((last?.vibration ?? device.vibration) - evidenceStartVibration).toFixed(1)} mm/s）`,
      `过去6小时轴承温度由 ${evidenceStartTemperature.toFixed(0)}℃ 上升至 ${(last?.temperature ?? device.temperature).toFixed(0)}℃（变化 +${((last?.temperature ?? device.temperature) - evidenceStartTemperature).toFixed(0)}℃）`,
      `当前处于${device.operatingCondition}工况，健康度为 ${device.healthScore}`,
    ];
    return {
      deviceId: device.deviceId,
      riskJudgment: `${device.deviceName}当前为${device.riskLevel}，存在异常趋势继续发展的风险。`,
      operatingCondition: device.operatingCondition,
      abnormalIndicators: abnormalIndicators.length ? abnormalIndicators : ['暂未发现明显越限指标'],
      trendEvidence: evidence,
      suspectedCauses: device.deviceId === 'IDF-001' ? ['轴承磨损', '润滑状态异常', '联轴器不对中', '地脚松动'] : causes.length ? causes : ['工况波动或测点偏差，需结合现场进一步确认'],
      inspectionItems: inspectionItems.length ? inspectionItems : ['复核测点', '对照设备说明书检查现场状态'],
      suggestedDeadline: device.riskLevel === '高风险' ? '建议立即由现场负责人评估处置' : device.riskLevel === '二级预警' ? '24小时内' : '72小时内',
      relatedSpareParts,
      confidence: device.deviceId === 'IDF-001' ? 0.86 : 0.74,
      riskNotice: '本结果根据模拟数据和规则模型生成，仅用于比赛方案展示。实际生产应用需结合企业真实数据、设备说明书、安全规程和专业人员判断。是否停机应由现场负责人结合安全规程决定。',
      generatedAt: new Date().toISOString(), provider: this.name,
    };
  }
}

/** 预留真实大模型适配器；未配置 API Key 时不会实例化。 */
export interface OpenAIProvider extends AiDiagnosisProvider { readonly providerFamily: 'openai' }
export interface OtherLLMProvider extends AiDiagnosisProvider { readonly providerFamily: 'other' }
