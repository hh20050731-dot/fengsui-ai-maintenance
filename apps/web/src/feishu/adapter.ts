import type { User } from '@fengsui/shared';
import { postJson } from '../services/api';

export interface FeishuEnvironment { inClient: boolean; sdkReady: boolean; userAgentMatched: boolean }
export function detectFeishuEnvironment(): FeishuEnvironment {
  const userAgentMatched = /Lark|Feishu/i.test(navigator.userAgent);
  return { inClient: Boolean(window.tt && (window.tt.requestAccess || window.tt.requestAuthCode)) || userAgentMatched, sdkReady: Boolean(window.tt && window.h5sdk), userAgentMatched };
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
  const code = await requestCode(appId);
  return postJson<User>('/auth/feishu/login', { code });
}

export function showFeishuToast(title: string) { window.tt?.showToast?.({ title, icon: 'success' }); }
