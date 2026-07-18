import { Expand, Eye, EyeOff, Focus, Layers, Maximize2, MoveHorizontal, ScanLine, View } from 'lucide-react';
import type { CameraView, CasingDisplayMode } from '../digitalTwinTypes';

const casingModeLabels: Record<CasingDisplayMode, string> = {
  normal: '机壳正常',
  transparent: '机壳半透',
  hidden: '机壳隐藏',
};

const nextCasingMode: Record<CasingDisplayMode, CasingDisplayMode> = {
  normal: 'transparent',
  transparent: 'hidden',
  hidden: 'normal',
};

interface ViewToolbarProps {
  onView: (view: CameraView) => void;
  onFullscreen: () => void;
  fullscreen: boolean;
  casingDisplayMode: CasingDisplayMode;
  couplingGuardVisible: boolean;
  couplingGuardAvailable: boolean;
  onCasingDisplayModeChange: (mode: CasingDisplayMode) => void;
  onCouplingGuardVisibleChange: (visible: boolean) => void;
}

export function ViewToolbar({
  onView,
  onFullscreen,
  fullscreen,
  casingDisplayMode,
  couplingGuardVisible,
  couplingGuardAvailable,
  onCasingDisplayModeChange,
  onCouplingGuardVisibleChange,
}: ViewToolbarProps) {
  const actions: Array<{ view: CameraView; label: string; icon: typeof Focus }> = [
    { view: 'reset', label: '复位', icon: Focus },
    { view: 'front', label: '正视', icon: ScanLine },
    { view: 'side', label: '侧视', icon: MoveHorizontal },
    { view: 'top', label: '俯视', icon: View },
  ];
  return (
    <div className="twin-view-toolbar">
      {actions.map(({ view, label, icon: Icon }) => (
        <button key={view} type="button" onClick={() => onView(view)} title={`${label}图`}>
          <Icon size={14} />{label}
        </button>
      ))}
      <span className="twin-view-toolbar__divider" />
      <button
        type="button"
        data-testid="casing-display-toggle"
        onClick={() => onCasingDisplayModeChange(nextCasingMode[casingDisplayMode])}
        title="循环切换机壳正常、半透明和隐藏状态"
      >
        <Layers size={14} />{casingModeLabels[casingDisplayMode]}
      </button>
      {couplingGuardAvailable && (
        <button
          type="button"
          data-testid="coupling-guard-toggle"
          onClick={() => onCouplingGuardVisibleChange(!couplingGuardVisible)}
          title="显示或隐藏联轴器防护罩"
        >
          {couplingGuardVisible ? <Eye size={14} /> : <EyeOff size={14} />}
          防护罩{couplingGuardVisible ? '显示' : '隐藏'}
        </button>
      )}
      <span className="twin-view-toolbar__divider" />
      <button type="button" onClick={onFullscreen}>
        {fullscreen ? <Expand size={14} /> : <Maximize2 size={14} />}
        {fullscreen ? '退出' : '全屏'}
      </button>
    </div>
  );
}
