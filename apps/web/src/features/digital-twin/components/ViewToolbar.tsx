import { Expand, Focus, Maximize2, MoveHorizontal, ScanLine, View } from 'lucide-react';
import type { CameraView } from '../digitalTwinTypes';

export function ViewToolbar({ onView, onFullscreen, fullscreen }: { onView: (view: CameraView) => void; onFullscreen: () => void; fullscreen: boolean }) {
  const actions: Array<{ view: CameraView; label: string; icon: typeof Focus }> = [
    { view: 'reset', label: '复位', icon: Focus },
    { view: 'front', label: '正视', icon: ScanLine },
    { view: 'side', label: '侧视', icon: MoveHorizontal },
    { view: 'top', label: '俯视', icon: View },
  ];
  return <div className="twin-view-toolbar">
    {actions.map(({ view, label, icon: Icon }) => <button key={view} type="button" onClick={() => onView(view)} title={`${label}图`}><Icon size={14} />{label}</button>)}
    <span className="twin-view-toolbar__divider" />
    <button type="button" onClick={onFullscreen}>{fullscreen ? <Expand size={14} /> : <Maximize2 size={14} />}{fullscreen ? '退出' : '全屏'}</button>
  </div>;
}
