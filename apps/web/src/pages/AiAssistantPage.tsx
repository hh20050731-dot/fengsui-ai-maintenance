import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronRight, FileSearch, ImagePlus, Play, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { useState } from 'react';
import type { AgentRun, AiDiagnosis, DiagnosisResult, Equipment, MultimodalInspection, RagSearchResult } from '@fengsui/shared';
import { IndustrialPanel } from '../components/industrial';
import { PageHeader } from '../components/PageHeader';
import { DemoDisclaimer, ErrorState, Loading, RiskBadge } from '../components/ui';
import { api, postJson } from '../services/api';
import { generateUuid } from '../utils/generateUuid';
import '../styles/ai-assistant.css';

const presets = [
  '当前风险最高的设备是什么？',
  '当前有哪些高风险设备？',
  '1号引风机当前状态如何？',
  '当前有哪些待处理工单？',
  '当前备件库存是否满足维修需求？',
  '哪台设备应该优先检修？',
  '为什么判断1号引风机存在轴承温升风险？',
];

const mediaTypes: MultimodalInspection['mediaType'][] = ['现场照片', '仪表照片', '泄漏照片', '振动频谱截图', '温度趋势截图'];
interface ChatMessage { id: string; role: 'user' | 'assistant'; text?: string; diagnosis?: AiDiagnosis }
interface ProviderStatus { provider: 'doubao' | 'rule-based'; configured: boolean; available: boolean; safeErrorCode?: string; requests: number; promptTokens: number; completionTokens: number }

function DiagnosisAnswer({ item }: { item: AiDiagnosis }) {
  return <div className="diagnosis-answer">
    <div className="diagnosis-answer__risk">{item.riskJudgment}</div>
    <div className="diagnosis-answer__grid">
      <div><span>当前工况</span><p>{item.operatingCondition}</p></div>
      <div><span>异常指标</span><p>{item.abnormalIndicators.join('、') || '未发现明确越限指标'}</p></div>
      <div className="is-wide"><span>趋势证据</span><ul>{item.trendEvidence.map((value) => <li key={value}>{value}</li>)}</ul></div>
      <div><span>疑似原因</span><ul>{item.suspectedCauses.map((value) => <li key={value}>{value}</li>)}</ul></div>
      <div><span>推荐检查</span><ul>{item.inspectionItems.map((value) => <li key={value}>{value}</li>)}</ul></div>
      <div><span>建议时限</span><p className="is-warning">{item.suggestedDeadline}</p></div>
      <div><span>关联备件</span><p>{item.relatedSpareParts.join('、') || '暂未匹配明确备件'}</p></div>
    </div>
    <div className="diagnosis-answer__confidence"><span>规则匹配度</span><strong>{Math.round(item.confidence * 100)}%</strong><small>基于模拟数据和规则库计算，仅供辅助参考。</small></div>
    <p className="diagnosis-answer__notice">{item.riskNotice}</p>
  </div>;
}

function RagEvidence({ result }: { result?: RagSearchResult }) {
  if (!result) return <p className="capability-empty">执行检索后将在此显示可追溯知识片段；无匹配时不会生成虚假引用。</p>;
  return <div className="evidence-list">
    <p className="capability-summary">{result.message}</p>
    {result.citations.map((citation) => <article key={citation.citationId} className="evidence-item">
      <div><strong>{citation.title}</strong><span>{Math.round(citation.relevance * 100)}%</span></div>
      <small>{citation.section} · {citation.sourceRef}</small>
      <p>{citation.excerpt}</p>
    </article>)}
  </div>;
}

function AgentRunView({ run }: { run?: AgentRun }) {
  if (!run) return <p className="capability-empty">Agent只展示工具调用摘要，不展示或存储隐藏推理过程；创建工单前默认等待人工确认。</p>;
  return <div className="agent-run">
    <div className="agent-run__summary"><span>{run.status === 'awaiting_confirmation' ? '等待人工确认' : run.status}</span><strong>{run.riskConclusion}</strong></div>
    <ol>{run.steps.map((step, index) => <li key={step.stepId}><span className="industrial-data">{String(index + 1).padStart(2, '0')}</span><div><strong>{step.toolName}</strong><p>{step.outputSummary}</p></div></li>)}</ol>
  </div>;
}

function MultimodalView({ result }: { result?: MultimodalInspection }) {
  if (!result) return <p className="capability-empty">支持JPG、PNG、WebP，单文件不超过8MB。图片不会被写入工单或飞书表格。</p>;
  return <div className="multimodal-result">
    <strong>{result.observationSummary}</strong>
    <div>{result.telemetryCorrelation.map((item) => <p key={item}>{item}</p>)}</div>
    <h4>建议人工检查</h4>
    <ul>{result.manualInspectionTargets.map((item) => <li key={item}>{item}</li>)}</ul>
    {result.limitations.map((item) => <small key={item}>{item}</small>)}
  </div>;
}

export function AiAssistantPage() {
  const equipmentQuery = useQuery({ queryKey: ['equipment'], queryFn: () => api<Equipment[]>('/equipment') });
  const providerQuery = useQuery({ queryKey: ['ai-provider-status'], queryFn: () => api<ProviderStatus>('/ai/provider/status'), retry: false });
  const [deviceId, setDeviceId] = useState('');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: 'welcome', role: 'assistant', text: '这里是烽燧辅助研判。可按问题意图查询设备、预警、工单和备件，也可以调用证据检索、结构化研判与受控Agent。' }]);
  const [lastQuestion, setLastQuestion] = useState('为什么判断1号引风机存在轴承温升风险？');
  const [mediaType, setMediaType] = useState<MultimodalInspection['mediaType']>('现场照片');
  const selectedDeviceId = deviceId || equipmentQuery.data?.[0]?.deviceId || '';

  const chatMutation = useMutation({
    mutationFn: ({ question, id }: { question: string; id?: string }) => postJson<AiDiagnosis>('/ai/diagnose', { ...(id ? { deviceId: id } : {}), question }),
    onSuccess: (result) => setMessages((items) => [...items, { id: generateUuid(), role: 'assistant', diagnosis: result }]),
  });
  const ragMutation = useMutation({ mutationFn: () => postJson<RagSearchResult>('/rag/search', { query: lastQuestion, deviceType: equipmentQuery.data?.find((item) => item.deviceId === selectedDeviceId)?.deviceType, limit: 5 }) });
  const structuredMutation = useMutation({ mutationFn: () => postJson<DiagnosisResult>('/ai/structured-diagnose', { deviceId: selectedDeviceId, question: lastQuestion }) });
  const agentMutation = useMutation({ mutationFn: () => postJson<AgentRun>('/agent/run', { deviceId: selectedDeviceId, task: lastQuestion, maxSteps: 10, timeoutMs: 12_000, confirmCreateWorkOrder: false, operator: '黄浩' }) });
  const multimodalMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('仅支持JPG、PNG或WebP图片');
      if (file.size > 8 * 1024 * 1024) throw new Error('图片不得超过8MB');
      const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('读取图片失败')); reader.readAsDataURL(file); });
      return postJson<MultimodalInspection>('/multimodal/inspect', { deviceId: selectedDeviceId, fileName: file.name, mediaType, mimeType: file.type, size: file.size, dataUrl });
    },
  });

  const send = (question: string) => {
    const text = question.trim();
    if (!text || chatMutation.isPending) return;
    setLastQuestion(text);
    setMessages((items) => [...items, { id: generateUuid(), role: 'user', text }]);
    chatMutation.mutate({ question: text, id: selectedDeviceId || undefined });
    setInput('');
  };

  if (equipmentQuery.isLoading) return <Loading />;
  if (equipmentQuery.isError) return <ErrorState error={equipmentQuery.error} />;
  const current = equipmentQuery.data?.find((item) => item.deviceId === selectedDeviceId);
  const provider = providerQuery.data;

  return <div className="ai-assistant-page">
    <PageHeader title="辅助研判" description="意图路由、可追溯知识检索、结构化诊断与受控运维Agent" />
    <DemoDisclaimer />
    <div className="ai-provider-strip mt-4">
      <div><ShieldCheck size={15} /><span>当前Provider</span><strong>{provider?.provider === 'doubao' ? '豆包大模型' : '规则安全回退'}</strong></div>
      <div><span className={`status-node ${provider?.available ? 'is-健康' : 'is-离线'} is-sm`} /><span>{provider?.available ? '可用' : '不可用'}</span></div>
      <p>未配置服务端密钥或远程调用失败时自动使用规则模型，不向前端暴露密钥。</p>
    </div>

    <div className="ai-workbench mt-4">
      <aside className="ai-question-rail industrial-panel">
        <header><strong>常用问题</strong><small>按意图查询真实演示数据</small></header>
        <div className="ai-presets">{presets.map((item) => <button key={item} onClick={() => send(item)}><span>{item}</span><ChevronRight size={13} /></button>)}</div>
        <div className="ai-device-select">
          <label className="label">研判设备</label>
          <select className="input" value={selectedDeviceId} onChange={(event) => setDeviceId(event.target.value)}>{equipmentQuery.data?.map((item) => <option key={item.deviceId} value={item.deviceId}>{item.deviceName}</option>)}</select>
          {current && <div className="ai-device-card"><div><strong>{current.deviceName}</strong><RiskBadge level={current.riskLevel} /></div><p><span className="industrial-data">{current.healthScore}</span><small>当前健康度</small></p><small>{current.operatingCondition} · {current.updatedAt.slice(0, 16).replace('T', ' ')}</small></div>}
        </div>
      </aside>

      <section className="ai-chat industrial-panel">
        <header className="industrial-panel__header"><div><h2 className="industrial-panel__title">设备问答</h2><div className="industrial-panel__meta mt-1">意图识别 · Repository查询 · 规则研判</div></div><span className="ai-online"><i />服务可用</span></header>
        <div className="ai-chat__messages scrollbar-thin">{messages.map((message) => <div key={message.id} className={`ai-message is-${message.role}`}><div className="ai-message__avatar">{message.role === 'user' ? '用' : '研'}</div><div className="ai-message__body">{message.text}{message.diagnosis && <DiagnosisAnswer item={message.diagnosis} />}</div></div>)}
          {chatMutation.isPending && <div className="ai-message is-assistant"><div className="ai-message__avatar">研</div><div className="ai-message__body">正在识别问题意图并查询对应数据…</div></div>}
          {chatMutation.isError && <div className="ai-error">研判请求失败：{chatMutation.error.message}。系统未返回固定模板，请检查连接后重试。</div>}
        </div>
        <form className="ai-chat__composer" onSubmit={(event) => { event.preventDefault(); send(input); }}><div><input className="input" value={input} onChange={(event) => setInput(event.target.value)} placeholder="输入设备、风险、工单、备件或原因问题…" /><button className="btn-primary" disabled={!input.trim() || chatMutation.isPending}><Send size={16} />发送</button></div><small>辅助研判不替代现场检查和安全决策，请结合设备说明书与企业规程使用。</small></form>
      </section>

      <aside className="ai-capabilities">
        <IndustrialPanel title="证据检索" meta="本地RAG · 来源可追溯" extra={<button className="panel-link" onClick={() => ragMutation.mutate()} disabled={ragMutation.isPending}><FileSearch size={13} />{ragMutation.isPending ? '检索中' : '检索'}</button>}>
          <div className="capability-body"><RagEvidence result={ragMutation.data} />{ragMutation.isError && <p className="ai-error">{ragMutation.error.message}</p>}</div>
        </IndustrialPanel>

        <IndustrialPanel title="结构化研判" meta={provider?.provider === 'doubao' ? '豆包Provider' : '规则安全回退'} extra={<button className="panel-link" onClick={() => structuredMutation.mutate()} disabled={structuredMutation.isPending}><Sparkles size={13} />研判</button>}>
          <div className="capability-body">{structuredMutation.data ? <div className="structured-result"><strong>{structuredMutation.data.summary}</strong><p>{structuredMutation.data.evidence.slice(0, 3).join(' ')}</p><small>{structuredMutation.data.provider} · 引用 {structuredMutation.data.citations.length} 条</small></div> : <p className="capability-empty">输出固定字段、引用与限制说明；远程Provider失败时安全回退。</p>}{structuredMutation.isError && <p className="ai-error">{structuredMutation.error.message}</p>}</div>
        </IndustrialPanel>

        <IndustrialPanel title="运维Agent" meta="受控工具链 · 默认人工确认" extra={<button className="panel-link" onClick={() => agentMutation.mutate()} disabled={agentMutation.isPending}><Play size={13} />{agentMutation.isPending ? '执行中' : '执行'}</button>}>
          <div className="capability-body"><AgentRunView run={agentMutation.data} />{agentMutation.isError && <p className="ai-error">{agentMutation.error.message}</p>}</div>
        </IndustrialPanel>

        <IndustrialPanel title="多模态现场资料" meta="图片 + 遥测 + 知识证据" extra={<label className="panel-link is-upload"><ImagePlus size={13} />选择图片<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) multimodalMutation.mutate(file); event.currentTarget.value = ''; }} /></label>}>
          <div className="capability-body"><select className="input mb-3" value={mediaType} onChange={(event) => setMediaType(event.target.value as MultimodalInspection['mediaType'])}>{mediaTypes.map((item) => <option key={item}>{item}</option>)}</select><MultimodalView result={multimodalMutation.data} />{multimodalMutation.isPending && <p className="capability-empty">正在校验图片并关联设备数据…</p>}{multimodalMutation.isError && <p className="ai-error">{multimodalMutation.error.message}</p>}</div>
        </IndustrialPanel>
      </aside>
    </div>
  </div>;
}
