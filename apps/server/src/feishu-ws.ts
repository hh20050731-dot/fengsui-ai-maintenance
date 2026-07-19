import { pathToFileURL } from 'node:url';
import { config as loadEnv } from 'dotenv';
import * as Lark from '@larksuiteoapi/node-sdk';
import {
  ControlledTaskQueue,
  createFeishuWsEventHandlers,
  type TrustedCallbackRuntime,
} from './services/feishu-ws-bridge.js';

loadEnv({ path: '.env', quiet: true });
loadEnv({ path: 'apps/server/.env', quiet: true, override: false });
process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.FEISHU_WS = '1';

const requiredConfig = [
  'FEISHU_APP_ID',
  'FEISHU_APP_SECRET',
  'FEISHU_BITABLE_APP_TOKEN',
  'FEISHU_WORK_ORDER_TABLE_ID',
  'APP_BASE_URL',
] as const;

const silentSdkLogger: Lark.Logger = {
  error: () => undefined,
  warn: () => undefined,
  info: () => undefined,
  debug: () => undefined,
  trace: () => undefined,
};

function loadRequiredConfig() {
  if (requiredConfig.some((key) => !process.env[key])) throw new Error('feishu-ws-configuration-incomplete');
  process.env.APP_MODE = 'feishu';
  return {
    appId: process.env.FEISHU_APP_ID as string,
    appSecret: process.env.FEISHU_APP_SECRET as string,
  };
}

function classifyConnectionError(error: Error) {
  const code = error.message.match(/code=(\d+)/)?.[1];
  if (code === '403') return 'subscription-mode-required';
  if (code === '514') return 'authentication-failed';
  if (code === '1000040350') return 'connection-limit';
  return 'connection-error';
}

export async function startFeishuWs() {
  const log = (message: string) => console.log(message);
  log('[Feishu WS] connecting');
  const { appId, appSecret } = loadRequiredConfig();
  const queue = new ControlledTaskQueue((label) => {
    log(`[Feishu WS] handled: ${label}:error`);
  });
  let runtimePromise: Promise<TrustedCallbackRuntime> | undefined;
  const loadRuntime = () => {
    runtimePromise ??= import('./services/feishu-callback-runtime.js')
      .then(({ prepareFeishuCallbackRuntime }) => prepareFeishuCallbackRuntime());
    return runtimePromise;
  };
  const handlers = createFeishuWsEventHandlers({ queue, loadRuntime, log });
  const dispatcher = new Lark.EventDispatcher({
    logger: silentSdkLogger,
    loggerLevel: Lark.LoggerLevel.error,
  }).register({
    'im.message.receive_v1': handlers['im.message.receive_v1'],
    'card.action.trigger': handlers['card.action.trigger'],
  });

  let shuttingDown = false;
  let retryTimer: NodeJS.Timeout | undefined;
  const scheduleRetry = () => {
    if (shuttingDown || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      if (!shuttingDown) {
        void wsClient.start({ eventDispatcher: dispatcher }).catch(() => {
          log('[Feishu WS] handled: connection-error');
          scheduleRetry();
        });
      }
    }, 15_000);
  };
  const wsClient = new Lark.WSClient({
    appId,
    appSecret,
    logger: silentSdkLogger,
    loggerLevel: Lark.LoggerLevel.error,
    autoReconnect: true,
    handshakeTimeoutMs: 15_000,
    onReady: () => {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = undefined;
      log('[Feishu WS] ready');
    },
    onError: (error) => {
      log(`[Feishu WS] handled: ${classifyConnectionError(error)}`);
      scheduleRetry();
    },
    onReconnecting: () => log('[Feishu WS] handled: reconnecting'),
    onReconnected: () => log('[Feishu WS] handled: reconnected'),
  });

  const shutdown = async (reason: string, exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = undefined;
    await queue.close();
    wsClient.close({ force: true });
    process.exitCode = exitCode;
    log(`[Feishu WS] handled: shutdown-${reason}`);
  };

  process.once('SIGINT', () => { void shutdown('SIGINT'); });
  process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.on('unhandledRejection', () => {
    log('[Feishu WS] handled: unhandledRejection');
  });
  process.on('uncaughtException', () => {
    log('[Feishu WS] handled: uncaughtException');
    void shutdown('uncaughtException', 1);
  });

  await wsClient.start({ eventDispatcher: dispatcher });
  return { wsClient, dispatcher, queue, shutdown };
}

const invokedAsEntry = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (invokedAsEntry) {
  void startFeishuWs().catch(() => {
    console.log('[Feishu WS] handled: start-failed');
    process.exitCode = 1;
  });
}
