import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { CompetitionRiskLevel, DiagnosisResult, Equipment, RagCitation, TelemetryPoint } from '@fengsui/shared';

const diagnosisPayloadSchema = z.object({
  summary: z.string().min(2),
  evidence: z.array(z.string()).default([]),
  multiParameterAnalysis: z.array(z.string()).default([]),
  possibleCauses: z.array(z.string()).default([]),
  confidenceSupport: z.string().min(2),
  riskLevel: z.enum(['正常', '关注', '预警', '严重']),
  inspectionSteps: z.array(z.string()).default([]),
  recommendedActions: z.array(z.string()).default([]),
  recommendedDeadline: z.string().min(1),
  requiredParts: z.array(z.string()).default([]),
  createWorkOrder: z.boolean(),
  limitations: z.array(z.string()).default([]),
});

export interface StructuredDiagnosisInput {
  device: Equipment;
  telemetry: TelemetryPoint[];
  citations: RagCitation[];
  question: string;
  alertId?: string;
}

export interface AiProviderStatus {
  provider: 'doubao' | 'rule-based';
  configured: boolean;
  available: boolean;
  safeErrorCode?: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
}

export interface StructuredAiProvider {
  readonly name: string;
  diagnose(input: StructuredDiagnosisInput): Promise<DiagnosisResult>;
  status(): AiProviderStatus;
}

function trend(values: number[], unit: string): string {
  if (values.length < 2) return `数据点不足，无法计算${unit}趋势`;
  const start = values[0]!;
  const end = values.at(-1)!;
  const delta = Number(Math.abs(end - start).toFixed(1));
  return `${start}→${end}${unit}，${end > start ? '上升' : end < start ? '下降' : '持平'}${delta}${unit}`;
}

function canonicalRisk(device: Equipment): CompetitionRiskLevel {
  if (device.riskLevel === '高风险') return '严重';
  if (device.riskLevel === '二级预警') return '预警';
  if (device.riskLevel === '关注') return '关注';
  return '正常';
}

export class RuleBasedFallbackProvider implements StructuredAiProvider {
  readonly name = 'RuleBasedFallbackProvider';
  private requests = 0;

  async diagnose(input: StructuredDiagnosisInput): Promise<DiagnosisResult> {
    this.requests += 1;
    const recent = input.telemetry.slice(-13);
    const vibrationTrend = trend(recent.map((item) => item.vibration), ' mm/s');
    const temperatureTrend = trend(recent.map((item) => item.temperature), '℃');
    const riskLevel = canonicalRisk(input.device);
    const abnormal = [
      input.device.vibration >= 4.5 ? `振动 ${input.device.vibration} mm/s` : '',
      input.device.temperature >= 75 ? `温度 ${input.device.temperature}℃` : '',
      input.device.current >= 100 ? `电流 ${input.device.current} A` : '',
    ].filter(Boolean);
    return {
      diagnosisId: `DG-${randomUUID()}`,
      deviceId: input.device.deviceId,
      alertId: input.alertId,
      summary: abnormal.length ? `${input.device.deviceName}存在${abnormal.join('、')}的组合风险，建议结合现场检查确认。` : `${input.device.deviceName}当前指标未触发高风险规则。`,
      evidence: [`当前工况：${input.device.operatingCondition}`, `振动趋势：${vibrationTrend}`, `温度趋势：${temperatureTrend}`, ...input.citations.map((item) => `[${item.citationId}] ${item.excerpt}`)],
      multiParameterAnalysis: [`健康度${input.device.healthScore}/100，风险等级${input.device.riskLevel}`, `振动${input.device.vibration} mm/s、温度${input.device.temperature}℃、电流${input.device.current} A`],
      possibleCauses: abnormal.length ? ['轴承或润滑状态异常', '转子不平衡或联轴器对中偏差', '负荷与冷却条件变化'] : ['暂未形成明确故障原因候选'],
      confidenceSupport: `规则匹配基于${recent.length}个近期遥测点和${input.citations.length}条可追溯知识证据。`,
      riskLevel,
      inspectionSteps: abnormal.length ? ['校验传感器与工况', '检查润滑状态', '检查轴承间隙与联轴器对中', '由现场负责人依据安全规程决定是否停机'] : ['按计划点检并持续观察趋势'],
      recommendedActions: abnormal.length ? ['24小时内安排现场复核', '记录复测指标并关联工单'] : ['保持监测'],
      recommendedDeadline: riskLevel === '严重' ? '立即安排' : riskLevel === '预警' ? '24小时内' : riskLevel === '关注' ? '72小时内' : '按计划点检',
      requiredParts: input.device.deviceId.startsWith('IDF') && abnormal.length ? ['风机轴承', '通用润滑油'] : [],
      createWorkOrder: ['预警', '严重'].includes(riskLevel),
      citations: input.citations,
      limitations: ['当前为比赛演示规则模型，不代表真实设备诊断结果。', '是否停机应由现场负责人结合设备说明书和安全规程决定。'],
      provider: this.name,
      generatedAt: new Date().toISOString(),
    };
  }

  status(): AiProviderStatus { return { provider: 'rule-based', configured: true, available: true, requests: this.requests, promptTokens: 0, completionTokens: 0 }; }
}

interface DoubaoOptions {
  apiKey?: string;
  model?: string;
  baseUrl: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class DoubaoProvider implements StructuredAiProvider {
  readonly name = 'DoubaoProvider';
  private requests = 0;
  private promptTokens = 0;
  private completionTokens = 0;
  private lastErrorCode?: string;
  private readonly requestWindow: number[] = [];
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: DoubaoOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get configured(): boolean { return Boolean(this.options.apiKey && this.options.model); }

  async diagnose(input: StructuredDiagnosisInput): Promise<DiagnosisResult> {
    if (!this.configured) throw new Error('DOUBAO_NOT_CONFIGURED');
    const windowStart = Date.now() - 60_000;
    while (this.requestWindow[0] !== undefined && this.requestWindow[0] < windowStart) this.requestWindow.shift();
    if (this.requestWindow.length >= 30) {
      this.lastErrorCode = 'DOUBAO_RATE_LIMITED_LOCALLY';
      throw new Error(this.lastErrorCode);
    }
    this.requestWindow.push(Date.now());
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 10_000);
    const citations = input.citations.map((item) => ({ id: item.citationId, title: item.title, excerpt: item.excerpt, source: item.sourceRef }));
    const prompt = JSON.stringify({
      requirement: '仅基于给定设备数据和引用证据输出JSON。使用“存在风险/疑似/可能有关/建议确认”，不得使用绝对故障结论。不得编造引用。',
      question: input.question,
      device: input.device,
      recentTelemetry: input.telemetry.slice(-13),
      citations,
      outputFields: Object.keys(diagnosisPayloadSchema.shape),
    });
    try {
      let lastError: unknown;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          this.requests += 1;
          const response = await this.fetchImpl(`${this.options.baseUrl.replace(/\/$/, '')}/chat/completions`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${this.options.apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: this.options.model, messages: [{ role: 'system', content: '你是工业设备辅助研判助手，只输出合法JSON。' }, { role: 'user', content: prompt }], temperature: 0.1, response_format: { type: 'json_object' } }),
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(`DOUBAO_HTTP_${response.status}`);
          const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
          this.promptTokens += payload.usage?.prompt_tokens ?? 0;
          this.completionTokens += payload.usage?.completion_tokens ?? 0;
          const content = payload.choices?.[0]?.message?.content;
          if (!content) throw new Error('DOUBAO_EMPTY_RESPONSE');
          const parsed = diagnosisPayloadSchema.parse(JSON.parse(content));
          this.lastErrorCode = undefined;
          return {
            diagnosisId: `DG-${randomUUID()}`, deviceId: input.device.deviceId, alertId: input.alertId,
            ...parsed, citations: input.citations, provider: this.name, generatedAt: new Date().toISOString(),
          };
        } catch (error) {
          lastError = error;
          if (attempt === 0) continue;
        }
      }
      this.lastErrorCode = lastError instanceof Error && lastError.message.startsWith('DOUBAO_') ? lastError.message : 'DOUBAO_INVALID_RESPONSE';
      throw new Error(this.lastErrorCode);
    } finally {
      clearTimeout(timeout);
    }
  }

  status(): AiProviderStatus {
    return { provider: 'doubao', configured: this.configured, available: this.configured && !this.lastErrorCode, safeErrorCode: this.lastErrorCode, requests: this.requests, promptTokens: this.promptTokens, completionTokens: this.completionTokens };
  }
}

export class ResilientAiProvider implements StructuredAiProvider {
  readonly name = 'ResilientAiProvider';
  constructor(private readonly primary: DoubaoProvider, private readonly fallback: RuleBasedFallbackProvider) {}
  async diagnose(input: StructuredDiagnosisInput): Promise<DiagnosisResult> {
    if (this.primary.configured) {
      try { return await this.primary.diagnose(input); } catch { /* 安全回退，不暴露远程响应或凭证。 */ }
    }
    return this.fallback.diagnose(input);
  }
  status(): AiProviderStatus { return this.primary.configured ? this.primary.status() : this.fallback.status(); }
}
