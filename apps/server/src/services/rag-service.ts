import {
  faultCases,
  type CompetitionRiskLevel,
  type RagChunk,
  type RagCitation,
  type RagDocument,
  type RagSearchRequest,
  type RagSearchResult,
} from '@fengsui/shared';
import type { DataRepository } from '../repositories/data-repository.js';

export interface RagRepository {
  search(request: RagSearchRequest): Promise<RagSearchResult>;
}

const semanticAliases: Record<string, string[]> = {
  轴承: ['温升', '过热', '振动', '润滑', '磨损'],
  温度: ['温升', '过热', '高温'],
  振动: ['不平衡', '对中', '基频'],
  泄漏: ['渗漏', '密封'],
  压力: ['出口压力', '吸入压力', '压降'],
  堵塞: ['卡阻', '堵转', '滤网'],
};

export function tokenizeRagText(value: string): string[] {
  const normalized = value.toLowerCase().replace(/[，。！？、；：,.!?;:()（）{}]/g, ' ').replaceAll('[', ' ').replaceAll(']', ' ').replace(/\s+/g, ' ').trim();
  const words = normalized.split(' ').filter((item) => item.length > 1);
  const compact = normalized.replace(/\s/g, '');
  const ngrams: string[] = [];
  for (let index = 0; index < compact.length - 1; index += 1) ngrams.push(compact.slice(index, index + 2));
  const aliases = Object.entries(semanticAliases).flatMap(([key, values]) => normalized.includes(key) ? values : []);
  return [...new Set([...words, ...ngrams, ...aliases])];
}

function riskFromLegacy(value: string): CompetitionRiskLevel {
  if (value === '高风险') return '严重';
  if (value === '二级预警') return '预警';
  if (value === '关注') return '关注';
  return '正常';
}

function chunkDocument(document: RagDocument): RagChunk[] {
  return document.content
    .split(/(?<=[。；])/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text, index) => ({
      chunkId: `${document.documentId}-CH-${String(index + 1).padStart(2, '0')}`,
      documentId: document.documentId,
      section: `第${index + 1}节`,
      text,
      tokens: tokenizeRagText(text),
      deviceTypes: document.deviceTypes,
      faultTypes: document.faultTypes,
      riskLevels: document.riskLevels,
    }));
}

function includesLoose(values: string[], expected?: string): boolean {
  if (!expected) return true;
  return values.some((value) => value.includes(expected) || expected.includes(value));
}

export class LocalRagService implements RagRepository {
  constructor(private readonly repository: DataRepository) {}

  async search(request: RagSearchRequest): Promise<RagSearchResult> {
    try {
      const documents = await this.buildDocuments();
      const queryTokens = tokenizeRagText(request.query);
      if (queryTokens.length === 0) return { query: request.query, citations: [], matchedDocumentCount: 0, degraded: false, message: '未检索到可引用证据。' };
      const querySet = new Set(queryTokens);
      const scored = documents
        .filter((document) => includesLoose(document.deviceTypes, request.deviceType))
        .filter((document) => includesLoose(document.faultTypes, request.faultType))
        .filter((document) => !request.riskLevel || document.riskLevels.includes(request.riskLevel))
        .flatMap((document) => chunkDocument(document).map((chunk) => {
          const overlap = chunk.tokens.filter((token) => querySet.has(token)).length;
          const exactBonus = document.faultTypes.some((type) => request.query.includes(type)) ? 8 : 0;
          const deviceBonus = document.deviceTypes.some((type) => request.query.includes(type)) ? 5 : 0;
          const score = overlap + exactBonus + deviceBonus;
          return { document, chunk, score };
        }))
        .filter((item) => item.score >= 2)
        .sort((left, right) => right.score - left.score || left.chunk.chunkId.localeCompare(right.chunk.chunkId));

      const limit = request.limit ?? 5;
      const citations: RagCitation[] = scored.slice(0, limit).map(({ document, chunk, score }, index) => ({
        citationId: `CIT-${String(index + 1).padStart(2, '0')}-${chunk.chunkId}`,
        documentId: document.documentId,
        chunkId: chunk.chunkId,
        title: document.title,
        section: chunk.section,
        sourceRef: document.sourceRef,
        excerpt: chunk.text.slice(0, 220),
        relevance: Number(Math.min(1, score / Math.max(8, queryTokens.length)).toFixed(3)),
      }));
      return {
        query: request.query,
        citations,
        matchedDocumentCount: new Set(citations.map((item) => item.documentId)).size,
        degraded: false,
        message: citations.length ? `召回 ${citations.length} 条可追溯证据。` : '未检索到可引用证据，不生成虚构来源。',
      };
    } catch {
      return { query: request.query, citations: [], matchedDocumentCount: 0, degraded: true, message: '知识检索暂不可用，已安全降级且未生成虚构引用。' };
    }
  }

  private async buildDocuments(): Promise<RagDocument[]> {
    const [knowledge, orders] = await Promise.all([this.repository.listKnowledge(), this.repository.listWorkOrders()]);
    const knowledgeDocuments: RagDocument[] = knowledge.map((entry) => ({
      documentId: `DOC-${entry.knowledgeId}`,
      title: entry.title,
      sourceType: '检修指南',
      sourceRef: `/knowledge?entry=${encodeURIComponent(entry.knowledgeId)}`,
      deviceTypes: [entry.deviceType],
      faultTypes: [entry.title, entry.faultPhenomenon, ...entry.possibleCauses],
      riskLevels: ['关注', '预警', '严重'],
      content: `故障现象：${entry.faultPhenomenon}。可能原因：${entry.possibleCauses.join('、')}。检查步骤：${entry.inspectionSteps.join('；')}。处理方法：${entry.handlingMethod.join('；')}。安全提醒：${entry.safetyReminder}`,
      updatedAt: entry.updatedAt,
    }));
    const caseDocuments: RagDocument[] = faultCases.map((item) => ({
      documentId: `DOC-${item.caseId}`,
      title: item.title,
      sourceType: '故障案例',
      sourceRef: `fault-case:${item.caseId}`,
      deviceTypes: [item.deviceType],
      faultTypes: [item.faultType, ...item.possibleCauses],
      riskLevels: [item.riskLevel],
      content: `异常指标：${item.abnormalIndicators.join('、')}。趋势证据：${item.riskContributions.map((value) => value.evidence).join('；')}。原因候选：${item.possibleCauses.join('、')}。检查建议：${item.recommendedActions.join('；')}。建议时限：${item.recommendedDeadline}。适用边界：${item.dataBoundary}`,
      updatedAt: new Date('2026-07-20T00:00:00+08:00').toISOString(),
    }));
    const orderDocuments: RagDocument[] = orders.map((order) => ({
      documentId: `DOC-WO-${order.workOrderNo}`,
      title: `维修工单 ${order.workOrderNo}`,
      sourceType: '工单',
      sourceRef: `/work-orders/${encodeURIComponent(order.workOrderNo)}`,
      deviceTypes: [order.deviceName],
      faultTypes: [order.faultType, order.faultPart],
      riskLevels: [riskFromLegacy(order.riskLevel)],
      content: `设备：${order.deviceName}。故障：${order.faultDescription}。检修建议：${order.maintenanceSuggestion.join('；')}。处理状态：${order.status}。维修结果：${order.repairResult ?? '尚未填写'}。`,
      updatedAt: order.completedAt ?? order.createdAt,
    }));
    return [...knowledgeDocuments, ...caseDocuments, ...orderDocuments];
  }
}
