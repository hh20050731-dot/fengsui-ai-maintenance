import { Fan, Wifi } from 'lucide-react';
import type { resolveDigitalTwinEquipment } from '../equipmentConfig';

type TwinEquipment = ReturnType<typeof resolveDigitalTwinEquipment>;

export function EquipmentList({ equipment }: { equipment: TwinEquipment }) {
  return <section className="panel overflow-hidden">
    <div className="panel-header"><h2 className="panel-title">设备</h2><span className="text-xs text-[#8F959E]">1 台</span></div>
    <button type="button" className="w-full border-l-[3px] border-[#4E5969] bg-[#F7F7F7] p-4 text-left">
      <div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-[#D9DADC] bg-white text-[#646A73]"><Fan size={18} /></div><div className="min-w-0 flex-1"><div className="font-medium text-[#1F2329]">{equipment.deviceName}</div><div className="mt-1 font-mono text-xs text-[#8F959E]">{equipment.queryId}</div><div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700"><Wifi size={13} /><span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />在线</div></div></div>
    </button>
    <div className="border-t border-[#E5E6EB] px-4 py-3 text-xs leading-5 text-[#646A73]"><div>{equipment.equipmentType}</div><div className="text-[#8F959E]">{equipment.location}</div><div className="mt-1 text-[#8F959E]">台账编号：{equipment.deviceId}</div></div>
  </section>;
}
