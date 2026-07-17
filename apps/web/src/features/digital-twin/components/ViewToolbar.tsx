import { Expand, Focus, Maximize2, MoveHorizontal, ScanLine, View } from 'lucide-react';
import type { CameraView } from '../digitalTwinTypes';

export function ViewToolbar({ onView, onFullscreen, fullscreen }: { onView: (view: CameraView) => void; onFullscreen: () => void; fullscreen: boolean }) {
  const actions: Array<{ view: CameraView; label: string; icon: typeof Focus }> = [
    { view: 'reset', label: '复位', icon: Focus },
    { view: 'front', label: '正视', icon: ScanLine },
    { view: 'side', label: '侧视', icon: MoveHorizontal },
    { view: 'top', label: '俯视', icon: View },
  ];
  return <div className="absolute right-3 top-3 z-10 flex flex-wrap justify-end gap-1 rounded border border-[#D9DADC] bg-white/95 p-1">
    {actions.map(({ view, label, icon: Icon }) => <button key={view} type="button" className="inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-xs text-[#4E5969] hover:bg-[#F2F3F5]" onClick={() => onView(view)} title={`${label}图`}><Icon size={14} />{label}</button>)}
    <span className="mx-0.5 w-px bg-[#E5E6EB]" />
    <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-xs text-[#4E5969] hover:bg-[#F2F3F5]" onClick={onFullscreen}>{fullscreen ? <Expand size={14} /> : <Maximize2 size={14} />}{fullscreen ? '退出' : '全屏'}</button>
  </div>;
}
