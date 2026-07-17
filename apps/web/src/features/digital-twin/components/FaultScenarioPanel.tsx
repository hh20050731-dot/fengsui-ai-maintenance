import clsx from 'clsx';
import { faultScenarioList } from '../faultScenarios';
import type { FaultScenarioId } from '../digitalTwinTypes';

export function FaultScenarioPanel({ value, onChange }: { value: FaultScenarioId; onChange: (value: FaultScenarioId) => void }) {
  return <section className="panel mt-4 overflow-hidden">
    <div className="panel-header"><h2 className="panel-title">故障场景</h2><span className="text-xs text-[#8F959E]">演示切换</span></div>
    <div className="p-2">{faultScenarioList.map((scenario) => <button key={scenario.id} type="button" aria-pressed={value === scenario.id} className={clsx('mb-1 flex w-full items-center justify-between rounded-sm px-3 py-2.5 text-left text-sm last:mb-0', value === scenario.id ? 'bg-[#F2F3F5] font-medium text-[#1F2329]' : 'text-[#646A73] hover:bg-[#FAFAFA]')} onClick={() => onChange(scenario.id)}><span>{scenario.name}</span><span className={clsx('h-2 w-2 rounded-full', scenario.risk === '高' ? 'bg-[#B85C5C]' : scenario.risk === '中高' ? 'bg-[#C8894A]' : 'bg-[#7FA58A]')} /></button>)}</div>
    <div className="border-t border-[#E5E6EB] px-4 py-3 text-[11px] leading-5 text-[#8F959E]">切换场景将同步更新指标、趋势、辅助研判与模型表现，不会写入设备台账。</div>
  </section>;
}
