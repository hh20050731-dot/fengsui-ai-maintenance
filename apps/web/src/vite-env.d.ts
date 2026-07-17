/// <reference types="vite/client" />

interface FeishuApiOptions<T = unknown> { appID?: string; appId?: string; scopeList?: string[]; success: (result: T) => void; fail: (error: unknown) => void }
interface Window {
  h5sdk?: { ready(callback: () => void): void };
  tt?: {
    requestAccess?: (options: FeishuApiOptions<{ code: string }>) => void;
    requestAuthCode?: (options: FeishuApiOptions<{ code: string }>) => void;
    showToast?: (options: { title: string; icon?: string }) => void;
  };
}
