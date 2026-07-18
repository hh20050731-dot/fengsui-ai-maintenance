import { ContactShadows, Grid, Html, OrbitControls, useGLTF, useProgress } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import {
  Component,
  Suspense,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { ErrorInfo, PropsWithChildren, ReactNode, RefObject } from 'react';
import { AlertCircle, Box } from 'lucide-react';
import { PerspectiveCamera, Vector3 } from 'three';
import { digitalTwinTheme } from '../digitalTwinTheme';
import type {
  CameraView,
  CasingDisplayMode,
  FanModelViewerHandle,
  FaultScenario,
  ModelInspection,
  ModelNodeInfo,
  PartResolution,
} from '../digitalTwinTypes';
import type { FanModelVersion } from '../modelVariants';
import { ModelScene } from './ModelScene';
import { ViewToolbar } from './ViewToolbar';

class ModelErrorBoundary extends Component<
  PropsWithChildren<{ resetKey: string; fallback: (error: Error) => ReactNode }>,
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[数字孪生] 模型加载失败', error, info);
  }

  override componentDidUpdate(previous: Readonly<PropsWithChildren<{ resetKey: string }>>) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  override render() {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children;
  }
}

function ModelLoading({ modelUrl }: { modelUrl: string }) {
  const { progress } = useProgress();
  return (
    <Html center>
      <div className="twin-viewer__loading">
        <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center text-[var(--twin-text-secondary)]">
          <Box className="animate-pulse" size={18} />
        </div>
        <div>正在加载引风机模型</div>
        <div className="twin-viewer__progress">
          <div className="twin-viewer__progress-bar" style={{ width: `${Math.max(4, progress)}%` }} />
        </div>
        <div className="twin-data twin-muted mt-2 text-[10px]">{Math.round(progress)}% · {modelUrl}</div>
      </div>
    </Html>
  );
}

function CameraController({ radius, apiRef }: { radius: number; apiRef: RefObject<FanModelViewerHandle | null> }) {
  const { camera, size } = useThree();
  const controls = useRef<any>(null);
  const setView = useCallback((view: CameraView) => {
    const perspective = camera as PerspectiveCamera;
    const verticalFov = perspective.fov * Math.PI / 180;
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(size.width / Math.max(size.height, 1), 0.4));
    const distance = radius / Math.sin(Math.min(verticalFov, horizontalFov) / 2) * 1.14;
    const directions: Record<CameraView, Vector3> = {
      reset: new Vector3(1.2, 0.72, 1.2),
      front: new Vector3(0, 0.12, 1),
      side: new Vector3(1, 0.12, 0),
      top: new Vector3(0, 1, 0.001),
    };
    perspective.position.copy(directions[view].normalize().multiplyScalar(distance));
    perspective.near = Math.max(distance / 100, 0.01);
    perspective.far = distance * 100;
    perspective.updateProjectionMatrix();
    controls.current?.target.set(0, 0, 0);
    controls.current?.update();
  }, [camera, radius, size.height, size.width]);
  useImperativeHandle(apiRef, () => ({ setView }), [setView]);
  useEffect(() => { setView('reset'); }, [setView]);
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableRotate
      enableZoom
      enablePan
      dampingFactor={0.08}
      enableDamping
      minDistance={radius * 0.65}
      maxDistance={radius * 8}
    />
  );
}

interface FanModelViewerProps {
  modelUrl: string;
  modelVersion: FanModelVersion;
  scenario: FaultScenario;
  casingDisplayMode: CasingDisplayMode;
  couplingGuardVisible: boolean;
  selectedNode: ModelNodeInfo | null;
  onCasingDisplayModeChange: (mode: CasingDisplayMode) => void;
  onCouplingGuardVisibleChange: (visible: boolean) => void;
  onSelectNode: (node: ModelNodeInfo | null) => void;
  onInspection: (inspection: ModelInspection) => void;
  onPartResolution: (resolution: PartResolution) => void;
  onSwitchToOriginal: () => void;
}

export const FanModelViewer = forwardRef<FanModelViewerHandle, FanModelViewerProps>(function FanModelViewer({
  modelUrl,
  modelVersion,
  scenario,
  casingDisplayMode,
  couplingGuardVisible,
  selectedNode,
  onCasingDisplayModeChange,
  onCouplingGuardVisibleChange,
  onSelectNode,
  onInspection,
  onPartResolution,
  onSwitchToOriginal,
}, ref) {
  const container = useRef<HTMLDivElement>(null);
  const cameraApi = useRef<FanModelViewerHandle>(null);
  const [radius, setRadius] = useState(3);
  const [fullscreen, setFullscreen] = useState(false);
  const [pageFullscreen, setPageFullscreen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const loadStartedAt = useRef(performance.now());

  useImperativeHandle(ref, () => ({ setView: (view) => cameraApi.current?.setView(view) }), []);

  useEffect(() => () => {
    useGLTF.clear(modelUrl);
  }, [modelUrl]);

  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === container.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  useEffect(() => {
    if (!pageFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [pageFullscreen]);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) { await document.exitFullscreen(); return; }
    if (pageFullscreen) { setPageFullscreen(false); return; }
    try {
      await container.current?.requestFullscreen();
      if (!document.fullscreenElement) setPageFullscreen(true);
    } catch {
      setPageFullscreen(true);
    }
  };

  const retry = () => {
    useGLTF.clear(modelUrl);
    loadStartedAt.current = performance.now();
    setReloadKey((value) => value + 1);
  };

  return (
    <div ref={container} className={`twin-viewer ${pageFullscreen ? 'fixed inset-0 z-[80] h-screen' : ''}`} data-testid="digital-twin-viewer">
      <ViewToolbar
        onView={(view) => cameraApi.current?.setView(view)}
        onFullscreen={() => void toggleFullscreen()}
        fullscreen={fullscreen || pageFullscreen}
        casingDisplayMode={casingDisplayMode}
        couplingGuardVisible={couplingGuardVisible}
        couplingGuardAvailable={modelVersion === 'enhanced-v1'}
        onCasingDisplayModeChange={onCasingDisplayModeChange}
        onCouplingGuardVisibleChange={onCouplingGuardVisibleChange}
      />
      <ModelErrorBoundary
        resetKey={`${modelUrl}:${reloadKey}`}
        fallback={(error) => (
          <div className="flex h-full items-center justify-center p-8">
            <div className="twin-viewer__error">
              <AlertCircle className="mx-auto text-red-400" size={28} />
              <h3 className="mt-3 font-semibold text-[var(--twin-text)]">3D模型加载失败</h3>
              <p className="mt-2 text-sm">实际请求路径：<span className="twin-data break-all">{modelUrl}</span></p>
              <p className="twin-muted mt-2 text-xs leading-5">
                请确认模型位于前端 public/models 目录，并检查 Vite 基础路径或网络请求是否可用。
                {error.message ? ` 错误：${error.message}` : ''}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button className="twin-order-button" onClick={retry}>重新加载</button>
                {modelVersion === 'enhanced-v1' && (
                  <button className="twin-back-button" onClick={onSwitchToOriginal}>切换到原模型</button>
                )}
              </div>
            </div>
          </div>
        )}
      >
        <Canvas
          key={`${modelUrl}:${reloadKey}`}
          shadows="basic"
          dpr={[1, 1.5]}
          camera={{ fov: 38, position: [6, 3.6, 6], near: 0.05, far: 500 }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          onPointerMissed={() => onSelectNode(null)}
        >
          <color attach="background" args={[digitalTwinTheme.scene.background]} />
          <fog attach="fog" args={[digitalTwinTheme.scene.fog, 11, 25]} />
          <ambientLight intensity={0.48} />
          <hemisphereLight args={[digitalTwinTheme.scene.hemisphereSky, digitalTwinTheme.scene.hemisphereGround, 0.88]} />
          <directionalLight position={[6, 9, 7]} intensity={1.45} castShadow shadow-mapSize={[1024, 1024]} />
          <directionalLight position={[-5, 3, -4]} intensity={0.48} />
          <Suspense fallback={<ModelLoading modelUrl={modelUrl} />}>
            <ModelScene
              modelUrl={modelUrl}
              modelVersion={modelVersion}
              scenario={scenario}
              casingDisplayMode={casingDisplayMode}
              couplingGuardVisible={couplingGuardVisible}
              selectedNodeUuid={selectedNode?.uuid ?? null}
              loadStartedAt={loadStartedAt.current}
              onSelectNode={onSelectNode}
              onInspection={onInspection}
              onFit={setRadius}
              onPartResolution={onPartResolution}
            />
          </Suspense>
          <Grid
            position={[0, -2.55, 0]}
            args={[24, 24]}
            cellSize={0.5}
            cellThickness={0.5}
            cellColor={digitalTwinTheme.scene.gridCell}
            sectionSize={2.5}
            sectionThickness={0.8}
            sectionColor={digitalTwinTheme.scene.gridSection}
            fadeDistance={18}
            fadeStrength={1}
            infiniteGrid
          />
          <ContactShadows position={[0, -2.48, 0]} opacity={0.25} scale={12} blur={2.5} far={8} />
          <CameraController radius={radius} apiRef={cameraApi} />
        </Canvas>
      </ModelErrorBoundary>
      <div className="twin-viewer__helper">左键旋转 · 滚轮缩放 · 右键平移 · 点击部件查看节点</div>
    </div>
  );
});
