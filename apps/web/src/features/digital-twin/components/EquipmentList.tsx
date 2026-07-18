import { Fan, Wifi } from 'lucide-react';
import type { resolveDigitalTwinEquipment } from '../equipmentConfig';

type TwinEquipment = ReturnType<typeof resolveDigitalTwinEquipment>;

export function EquipmentList({ equipment }: { equipment: TwinEquipment }) {
  return <section className="twin-panel">
    <div className="twin-panel__header"><h2 className="twin-panel__title">设备</h2><span className="twin-panel__meta">1 台</span></div>
    <button type="button" className="twin-equipment-card">
      <div className="flex items-start gap-3"><div className="twin-equipment-icon"><Fan size={17} /></div><div className="min-w-0 flex-1"><div className="text-sm font-medium">{equipment.deviceName}</div><div className="twin-data twin-muted mt-1 text-[11px]">{equipment.queryId}</div><div className="twin-online mt-2.5 text-[11px]"><Wifi size={12} />在线</div></div></div>
    </button>
    <div className="twin-equipment-detail"><div>{equipment.equipmentType}</div><div className="twin-muted">{equipment.location}</div><div className="twin-muted mt-1">台账编号：{equipment.deviceId}</div></div>
  </section>;
}
