import { Grid, Html, OrbitControls, useGLTF, useProgress } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { AlertCircle, Box } from 'lucide-react';
import { Component, Suspense, useEffect, useMemo, useState } from 'react';
import type { ErrorInfo, PropsWithChildren, ReactNode } from 'react';
import { Box3, Color, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import type { CasingDisplayMode, ModelInspection, ModelNodeInfo } from '../digitalTwinTypes';
import type { EquipmentModelDefinition } from '../equipmentModels';

class GeneralModelErrorBoundary extends Component<PropsWithChildren<{ resetKey: string; fallback: (error: Error) => ReactNode }>, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  override componentDidCatch(error: Error, info: ErrorInfo) { console.error('[数字孪生] 通用设备模型加载失败', error.name, info.componentStack?.slice(0, 120)); }
  override componentDidUpdate(previous: Readonly<PropsWithChildren<{ resetKey: string }>>) { if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); }
  override render() { return this.state.error ? this.props.fallback(this.state.error) : this.props.children; }
}

function Loading({ modelUrl }: { modelUrl: string }) {
  const { progress } = useProgress();
  return <Html center><div className="twin-viewer__loading"><Box className="mx-auto animate-pulse" size={18} /><div className="mt-2">正在加载设备语义模型</div><div className="twin-viewer__progress"><div className="twin-viewer__progress-bar" style={{ width: `${Math.max(4, progress)}%` }} /></div><div className="twin-data twin-muted mt-2 text-[10px]">{Math.round(progress)}% · {modelUrl}</div></div></Html>;
}

interface PreparedScene {
  root: Object3D;
  scale: number;
  center: Vector3;
  radius: number;
  meshes: Mesh[];
  sensors: Array<{ name: string; display: string; position: Vector3; fault: boolean }>;
  baseMaterials: Map<string, Array<{ color: Color; emissive: Color; emissiveIntensity: number; opacity: number; transparent: boolean; depthWrite: boolean }>>;
}

function prepareScene(source: Object3D): PreparedScene {
  const root = source.clone(true);
  const meshes: Mesh[] = [];
  root.traverse((node) => {
    if (!(node as Mesh).isMesh) return;
    const mesh = node as Mesh;
    mesh.geometry = mesh.geometry.clone();
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map((item) => item.clone()) : mesh.material.clone();
    meshes.push(mesh);
  });
  const bounds = new Box3().setFromObject(root);
  const center = bounds.getCenter(new Vector3());
  const size = bounds.getSize(new Vector3());
  const radius = Math.max(size.x, size.y, size.z) / 2 || 1;
  const scale = 3.4 / radius;
  const sensors: PreparedScene['sensors'] = [];
  root.updateWorldMatrix(true, true);
  root.traverse((node) => {
    if (node.userData.sensor_node || node.userData.fault_node || node.userData.semantic_locator) {
      const position = node.getWorldPosition(new Vector3());
      sensors.push({ name: node.name, display: String(node.userData.display_name_zh ?? node.name), position, fault: Boolean(node.userData.fault_node) });
    }
  });
  const baseMaterials = new Map<string, Array<{ color: Color; emissive: Color; emissiveIntensity: number; opacity: number; transparent: boolean; depthWrite: boolean }>>();
  for (const mesh of meshes) {
    const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).filter((item): item is MeshStandardMaterial => item instanceof MeshStandardMaterial);
    baseMaterials.set(mesh.uuid, materials.map((material) => ({ color: material.color.clone(), emissive: material.emissive.clone(), emissiveIntensity: material.emissiveIntensity, opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite })));
  }
  return { root, scale, center, radius: 3.4, meshes, sensors, baseMaterials };
}

function GeneralScene({ modelUrl, definition, faultActive, casingDisplayMode, guardVisible, selectedNode, onSelectNode, onInspection }: {
  modelUrl: string; definition: EquipmentModelDefinition; faultActive: boolean; casingDisplayMode: CasingDisplayMode; guardVisible: boolean; selectedNode: ModelNodeInfo | null; onSelectNode: (node: ModelNodeInfo | null) => void; onInspection: (inspection: ModelInspection) => void;
}) {
  const gltf = useGLTF(modelUrl);
  const prepared = useMemo(() => prepareScene(gltf.scene), [gltf.scene]);
  const rotating = useMemo(() => prepared.meshes.filter((mesh) => /shaft|rotor|impeller|gear_\d|coupling_(input|element|output)/i.test(mesh.name)), [prepared.meshes]);
  useEffect(() => {
    onInspection({ nodeCount: (() => { let count = 0; prepared.root.traverse(() => { count += 1; }); return count; })(), meshCount: prepared.meshes.length, namedMeshCount: prepared.meshes.filter((item) => item.name).length, semanticPartCount: prepared.meshes.filter((item) => item.userData.semantic_model).length, keyNodeCount: definition.semanticNodes.filter((name) => prepared.root.getObjectByName(name)).length, requiredKeyNodeCount: definition.semanticNodes.length, missingKeyNodes: definition.semanticNodes.filter((name) => !prepared.root.getObjectByName(name)), loadTimeMs: 0 });
  }, [definition.semanticNodes, onInspection, prepared]);
  useEffect(() => {
    for (const mesh of prepared.meshes) {
      const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).filter((item): item is MeshStandardMaterial => item instanceof MeshStandardMaterial);
      const bases = prepared.baseMaterials.get(mesh.uuid) ?? [];
      materials.forEach((material, index) => { const base = bases[index]; if (!base) return; material.color.copy(base.color); material.emissive.copy(base.emissive); material.emissiveIntensity = base.emissiveIntensity; material.opacity = base.opacity; material.transparent = base.transparent; material.depthWrite = base.depthWrite; material.needsUpdate = true; });
      const category = String(mesh.userData.semantic_category ?? '');
      const isCasing = category === 'casing' || /casing|housing|volute/i.test(mesh.name);
      const isGuard = category === 'guard' || /guard/i.test(mesh.name);
      mesh.visible = !(isCasing && casingDisplayMode === 'hidden') && !(isGuard && !guardVisible);
      if (mesh.visible && isCasing && casingDisplayMode === 'transparent') materials.forEach((material) => { material.transparent = true; material.opacity = 0.22; material.depthWrite = false; });
      if (faultActive && mesh.userData.fault_type) materials.forEach((material) => { material.color.set('#e0525d'); material.emissive.set('#7c141d'); material.emissiveIntensity = 0.65; });
      if (selectedNode?.uuid === mesh.uuid) materials.forEach((material) => { material.color.set('#55d5ff'); material.emissive.set('#075d77'); material.emissiveIntensity = 0.7; });
    }
  }, [casingDisplayMode, faultActive, guardVisible, prepared, selectedNode?.uuid]);
  useEffect(() => () => {
    prepared.meshes.forEach((mesh) => { mesh.geometry.dispose(); const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]; materials.forEach((material) => material.dispose()); });
  }, [prepared]);
  useFrame((_, delta) => { if (definition.supportsRotation) rotating.forEach((mesh) => { mesh.rotation.x += delta * 0.28; }); });
  return <group scale={prepared.scale} position={prepared.center.clone().multiplyScalar(-prepared.scale)}>
    <primitive object={prepared.root} onClick={(event: any) => { event.stopPropagation(); const node = event.object as Mesh; onSelectNode({ uuid: node.uuid, name: node.name, displayName: String(node.userData.display_name_zh ?? node.name), type: node.type, isMesh: Boolean(node.isMesh), parentName: node.parent?.name ?? '', vertexCount: node.geometry?.attributes.position?.count, materialNames: (Array.isArray(node.material) ? node.material : [node.material]).map((item) => item.name) }); }} />
    {prepared.sensors.map((item) => <group key={item.name} position={item.position}><mesh><sphereGeometry args={[0.035 / prepared.scale, 10, 8]} /><meshStandardMaterial color={item.fault && faultActive ? '#e0525d' : '#55d5ff'} emissive={item.fault && faultActive ? '#7c141d' : '#075d77'} emissiveIntensity={0.7} /></mesh><Html distanceFactor={10} className="pointer-events-none"><span className="twin-node-label">{item.display}</span></Html></group>)}
  </group>;
}

export function GeneralEquipmentViewer({ modelUrl, definition, faultActive, casingDisplayMode, guardVisible, selectedNode, onSelectNode, onInspection }: {
  modelUrl: string; definition: EquipmentModelDefinition; faultActive: boolean; casingDisplayMode: CasingDisplayMode; guardVisible: boolean; selectedNode: ModelNodeInfo | null; onSelectNode: (node: ModelNodeInfo | null) => void; onInspection: (inspection: ModelInspection) => void;
}) {
  const [retryKey, setRetryKey] = useState(0);
  useEffect(() => () => { useGLTF.clear(modelUrl); }, [modelUrl]);
  return <div className="twin-viewer" data-testid="general-equipment-viewer">
    <GeneralModelErrorBoundary resetKey={`${modelUrl}:${retryKey}`} fallback={(error) => <div className="flex h-full items-center justify-center p-8"><div className="twin-viewer__error"><AlertCircle className="mx-auto text-red-400" size={28} /><h3 className="mt-3 font-semibold">设备模型加载失败</h3><p className="mt-2 text-xs">{modelUrl}</p><p className="twin-muted mt-2 text-xs">{error.message || '请检查本地GLB资源。'}</p><button className="twin-order-button mt-4" onClick={() => { useGLTF.clear(modelUrl); setRetryKey((value) => value + 1); }}>重新加载</button></div></div>}>
      <Canvas key={`${modelUrl}:${retryKey}`} dpr={[1, 1.5]} camera={{ fov: 38, position: [6, 4, 6], near: 0.05, far: 100 }} gl={{ antialias: true, powerPreference: 'high-performance' }} onPointerMissed={() => onSelectNode(null)}>
        <color attach="background" args={['#020b14']} /><ambientLight intensity={0.65} /><hemisphereLight args={['#b8ddff', '#07121b', 0.9]} /><directionalLight position={[7, 9, 6]} intensity={1.5} /><directionalLight position={[-4, 3, -5]} intensity={0.45} />
        <Suspense fallback={<Loading modelUrl={modelUrl} />}><GeneralScene modelUrl={modelUrl} definition={definition} faultActive={faultActive} casingDisplayMode={casingDisplayMode} guardVisible={guardVisible} selectedNode={selectedNode} onSelectNode={onSelectNode} onInspection={onInspection} /></Suspense>
        <Grid position={[0, -2.5, 0]} args={[20, 20]} cellSize={0.5} cellColor="#12354a" sectionSize={2.5} sectionColor="#1d5c77" fadeDistance={18} infiniteGrid />
        <OrbitControls makeDefault enablePan enableZoom enableRotate minDistance={3} maxDistance={18} />
      </Canvas>
    </GeneralModelErrorBoundary>
    <div className="twin-viewer__helper">左键旋转 · 滚轮缩放 · 右键平移 · 点击部件查看语义节点</div>
  </div>;
}
