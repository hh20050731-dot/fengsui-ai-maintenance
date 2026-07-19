import { Fan, Wifi } from 'lucide-react';
import { digitalTwinEquipment } from '../equipmentConfig';
import type { resolveDigitalTwinEquipment } from '../equipmentConfig';

type TwinEquipment = ReturnType<typeof resolveDigitalTwinEquipment>;

export function EquipmentList({ equipment, onSelect }: { equipment: TwinEquipment; onSelect: (deviceId: string) => void }) {
  return <section className="twin-panel">
    <div className="twin-panel__header"><h2 className="twin-panel__title">设备模型</h2><span className="twin-panel__meta">{digitalTwinEquipment.length} 台</span></div>
    <div className="p-2"><select className="input h-9 min-h-9" value={equipment.deviceId} onChange={(event) => onSelect(event.target.value)} aria-label="切换数字孪生设备">{digitalTwinEquipment.map((item) => <option key={item.deviceId} value={item.deviceId}>{item.deviceName} · {item.deviceId}</option>)}</select></div>
    <button type="button" className="twin-equipment-card">
      <div className="flex items-start gap-3"><div className="twin-equipment-icon"><Fan size={17} /></div><div className="min-w-0 flex-1"><div className="text-sm font-medium">{equipment.deviceName}</div><div className="twin-data twin-muted mt-1 text-[11px]">{equipment.queryId}</div><div className="twin-online mt-2.5 text-[11px]"><Wifi size={12} />在线</div></div></div>
    </button>
    <div className="twin-equipment-detail"><div>{equipment.equipmentType}</div><div className="twin-muted">{equipment.location}</div><div className="twin-muted mt-1">台账编号：{equipment.deviceId}</div></div>
  </section>;
}
