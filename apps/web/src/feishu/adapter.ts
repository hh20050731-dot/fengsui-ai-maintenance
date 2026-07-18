import type { User } from '@fengsui/shared';
import { postJson } from '../services/api';

export interface FeishuEnvironment { inClient: boolean; sdkReady: boolean; userAgentMatched: boolean }
const FEISHU_SDK_URL = 'https://lf-scm-cn.feishucdn.com/lark/op/h5-js-sdk-1.5.34.js';
let sdkPromise: Promise<void> | undefined;
export function detectFeishuEnvironment(): FeishuEnvironment {
  const userAgentMatched = /Lark|Feishu/i.test(navigator.userAgent);
  return { inClient: Boolean(window.tt && (window.tt.requestAccess || window.tt.requestAuthCode)) || userAgentMatched, sdkReady: Boolean(window.tt && window.h5sdk), userAgentMatched };
}

function loadFeishuSdk(): Promise<void> {
  if (window.h5sdk) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-fengsui-feishu-sdk]');
    const script = existing ?? document.createElement('script');
    const timer = window.setTimeout(() => reject(new Error('飞书 JSSDK 加载超时，已继续使用演示身份')), 2_500);
    const finish = (callback: () => void) => { window.clearTimeout(timer); callback(); };
    script.addEventListener('load', () => finish(resolve), { once: true });
    script.addEventListener('error', () => finish(() => reject(new Error('飞书 JSSDK 加载失败，已继续使用演示身份'))), { once: true });
    if (!existing) {
      script.src = FEISHU_SDK_URL;
      script.async = true;
      script.dataset.fengsuiFeishuSdk = 'true';
      document.head.appendChild(script);
    }
  });
  return sdkPromise;
}

function requestCode(appId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const run = () => {
      if (window.tt?.requestAccess) {
        window.tt.requestAccess({ appID: appId, scopeList: [], success: ({ code }) => resolve(code), fail: reject });
      } else if (window.tt?.requestAuthCode) {
        window.tt.requestAuthCode({ appId, success: ({ code }) => resolve(code), fail: reject });
      } else reject(new Error('当前环境没有可用的飞书免登 API'));
    };
    if (window.h5sdk?.ready) window.h5sdk.ready(run); else run();
  });
}

export async function loginWithFeishu(): Promise<User | null> {
  const appId = import.meta.env.VITE_FEISHU_APP_ID as string | undefined;
  if (!appId || !detectFeishuEnvironment().inClient) return null;
  if (!window.h5sdk) await loadFeishuSdk();
  const code = await requestCode(appId);
  return postJson<User>('/auth/feishu/login', { code });
}

export function showFeishuToast(title: string) { window.tt?.showToast?.({ title, icon: 'success' }); }
