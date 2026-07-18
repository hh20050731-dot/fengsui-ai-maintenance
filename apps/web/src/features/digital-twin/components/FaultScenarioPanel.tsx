import clsx from 'clsx';
import { faultScenarioList } from '../faultScenarios';
import type { FaultScenarioId } from '../digitalTwinTypes';

export function FaultScenarioPanel({ value, onChange }: { value: FaultScenarioId; onChange: (value: FaultScenarioId) => void }) {
  return <section className="twin-panel twin-scenario-panel">
    <div className="twin-panel__header"><h2 className="twin-panel__title">故障场景</h2><span className="twin-panel__meta">演示切换</span></div>
    <div className="twin-scenario-list">{faultScenarioList.map((scenario) => <button key={scenario.id} data-testid={`scenario-${scenario.id}`} type="button" aria-pressed={value === scenario.id} className={clsx('twin-scenario-item', value === scenario.id && 'is-active', scenario.risk === '高' && 'is-danger')} onClick={() => onChange(scenario.id)}><span>{scenario.name}</span><span className={clsx('twin-scenario-dot', scenario.risk === '高' ? 'is-danger' : scenario.risk === '中高' && 'is-warning')} /></button>)}</div>
    <div className="twin-scenario-note">切换场景将同步更新指标、趋势、辅助研判与模型表现，不会写入设备台账。</div>
  </section>;
}
