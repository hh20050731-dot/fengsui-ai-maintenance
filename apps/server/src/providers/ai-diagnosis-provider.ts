import { buildRuleBasedDiagnosis, type AiDiagnosis, type RuleDiagnosisContext } from '@fengsui/shared';

export interface AiDiagnosisProvider {
  diagnose(input: RuleDiagnosisContext): Promise<AiDiagnosis>;
  readonly name: string;
}

export class RuleBasedDiagnosisProvider implements AiDiagnosisProvider {
  readonly name = 'RuleBasedDiagnosisProvider';
  async diagnose(input: RuleDiagnosisContext): Promise<AiDiagnosis> {
    return buildRuleBasedDiagnosis({ ...input, providerName: this.name });
  }
}

/** 预留真实大模型适配器；未配置 API Key 时不会实例化。 */
export interface OpenAIProvider extends AiDiagnosisProvider { readonly providerFamily: 'openai' }
export interface OtherLLMProvider extends AiDiagnosisProvider { readonly providerFamily: 'other' }
