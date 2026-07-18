const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim().replace(/\/$/, '') || '/api';
const requestedMode = (import.meta.env.VITE_APP_MODE as string | undefined)?.trim().toLowerCase() || 'mock';
const edgeOneStaticDemo = import.meta.env.MODE === 'edgeone';
const offlineDemoFlag = (import.meta.env.VITE_OFFLINE_DEMO as string | undefined)?.toLowerCase();

export const runtimeConfig = {
  apiBase,
  requestedMode,
  forceOfflineDemo: edgeOneStaticDemo || offlineDemoFlag === 'true',
  allowOfflineFallback: true,
  apiReadTimeoutMs: 5_000,
  apiWriteTimeoutMs: 15_000,
} as const;
