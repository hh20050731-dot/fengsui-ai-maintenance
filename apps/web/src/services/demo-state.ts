import type { DemoJournalEntry } from '@fengsui/shared';

export const DEMO_STATE_STORAGE_KEY = 'fengsui.demo.journal.v1';
export const DEMO_JOURNAL_HEADER = 'x-fengsui-demo-journal';
const MAX_ENTRIES = 40;

const isSupportedMutation = (method: string, path: string) => {
  if (method === 'PATCH') return /^\/equipment\/[^/]+$/.test(path);
  if (method !== 'POST') return false;
  return path === '/equipment'
    || /^\/alerts\/[^/]+\/(acknowledge|false-positive|create-work-order)$/.test(path)
    || path === '/work-orders'
    || /^\/work-orders\/[^/]+\/(transition|record|verify)$/.test(path)
    || /^\/spare-parts\/(inbound|outbound)$/.test(path);
};

export function readDemoJournal(): DemoJournalEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DEMO_STATE_STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed) || parsed.length > MAX_ENTRIES) throw new Error('invalid demo journal');
    return parsed.filter((item): item is DemoJournalEntry => {
      if (!item || typeof item !== 'object') return false;
      const entry = item as Partial<DemoJournalEntry>;
      return entry.version === 1 && (entry.method === 'POST' || entry.method === 'PATCH') && typeof entry.path === 'string';
    });
  } catch {
    window.localStorage.removeItem(DEMO_STATE_STORAGE_KEY);
    return [];
  }
}

export function clearDemoJournal() {
  if (typeof window !== 'undefined') window.localStorage.removeItem(DEMO_STATE_STORAGE_KEY);
}

export function encodeDemoJournal(entries = readDemoJournal()) {
  const bytes = new TextEncoder().encode(JSON.stringify(entries));
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function demoJournalHeaders() {
  return { [DEMO_JOURNAL_HEADER]: encodeDemoJournal() };
}

export function persistDemoMutation(path: string, init: RequestInit | undefined, result: unknown) {
  const method = (init?.method ?? 'GET').toUpperCase();
  if (!isSupportedMutation(method, path)) return;
  let body: unknown = {};
  try { body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}; } catch { return; }
  const resultId = result && typeof result === 'object'
    ? ((result as { workOrderId?: unknown }).workOrderId ?? (result as { deviceId?: unknown }).deviceId)
    : undefined;
  const entry: DemoJournalEntry = {
    version: 1,
    method: method as DemoJournalEntry['method'],
    path,
    body,
    ...(typeof resultId === 'string' ? { resultId } : {}),
  };
  const entries = [...readDemoJournal(), entry].slice(-MAX_ENTRIES);
  try { window.localStorage.setItem(DEMO_STATE_STORAGE_KEY, JSON.stringify(entries)); } catch { /* 本地存储不可用时仍保持当前请求可用 */ }
}
