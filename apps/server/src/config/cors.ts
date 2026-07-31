import type { CorsOptions } from 'cors';

export const defaultAllowedOrigins = [
  'https://dcniaqwtmoca.aiforce.cloud',
  'https://miaoda.feishu.cn',
  'https://fengsui-ai-maintenance.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
] as const;

function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/$/u, '');
}

export function resolveAllowedOrigins(configured?: string): string[] {
  const additional = configured
    ?.split(',')
    .map(normalizeOrigin)
    .filter(Boolean) ?? [];
  return [...new Set([...defaultAllowedOrigins, ...additional])];
}

export function buildCorsOptions(
  allowedOrigins: string[],
  exposedHeaders: string[] = [],
): CorsOptions {
  const whitelist = new Set(allowedOrigins.map(normalizeOrigin));
  return {
    origin(origin, callback) {
      if (!origin || whitelist.has(normalizeOrigin(origin))) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'X-Idempotency-Key',
    ],
    exposedHeaders,
    optionsSuccessStatus: 204,
  };
}
