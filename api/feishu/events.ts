import { waitUntil as vercelWaitUntil } from '@vercel/functions';
import {
  asFeishuCallbackObject,
  decryptFeishuEnvelope,
  safeSecretEqual,
  type FeishuCallbackObject,
} from '../../apps/server/src/services/feishu-callback-envelope.js';

const MAX_BODY_BYTES = 256 * 1024;
const ALLOWED_CARD_ACTIONS = new Set([
  'accept_work_order',
  'defer_work_order',
  'acknowledge',
  'create_work_order',
]);

type CallbackRequest = AsyncIterable<unknown> & {
  method?: string;
  body?: unknown;
};

type CallbackResponse = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
};

type CallbackRuntime = {
  handle(payload: FeishuCallbackObject): Promise<unknown>;
};

type TimingLogger = {
  info(message: string): void;
  error(message: string): void;
};

type TimingMetrics = Partial<Record<
  | 'function_entry_ms'
  | 'body_parsed_ms'
  | 'decrypted_ms'
  | 'token_verified_ms'
  | 'challenge_detected_ms'
  | 'challenge_response_ms'
  | 'app_initialized_ms'
  | 'handler_completed_ms',
  number
>>;

export interface FeishuCallbackHandlerOptions {
  verificationToken?: string;
  encryptKey?: string;
  waitUntil?: (promise: Promise<unknown>) => void;
  loadRuntime?: () => Promise<CallbackRuntime>;
  now?: () => number;
  logger?: TimingLogger;
}

function roundMilliseconds(value: number) {
  return Math.round(value * 100) / 100;
}

function logTiming(logger: TimingLogger, metrics: TimingMetrics) {
  const safeMetrics = Object.fromEntries(
    Object.entries(metrics)
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
      .map(([key, value]) => [key, roundMilliseconds(value)]),
  );
  logger.info(`[feishu-callback-timing] ${JSON.stringify(safeMetrics)}`);
}

function sendJson(response: CallbackResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.end(JSON.stringify(body));
}

function callbackError(status: number, code: string, message: string) {
  return { status, body: { success: false, error: { code, message } } };
}

function parseJsonText(text: string) {
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
    throw callbackError(413, 'PAYLOAD_TOO_LARGE', '回调请求体超过大小限制');
  }
  try {
    return asFeishuCallbackObject(JSON.parse(text));
  } catch {
    throw callbackError(400, 'INVALID_JSON', '请求体不是合法JSON');
  }
}

async function readJsonBody(request: CallbackRequest) {
  if (request.body !== undefined) {
    if (typeof request.body === 'string') return parseJsonText(request.body);
    if (Buffer.isBuffer(request.body)) return parseJsonText(request.body.toString('utf8'));
    if (request.body !== null && typeof request.body === 'object' && !Array.isArray(request.body)) {
      try {
        const serialized = JSON.stringify(request.body);
        if (Buffer.byteLength(serialized, 'utf8') > MAX_BODY_BYTES) {
          throw callbackError(413, 'PAYLOAD_TOO_LARGE', '回调请求体超过大小限制');
        }
        return asFeishuCallbackObject(request.body);
      } catch (error) {
        if (error !== null && typeof error === 'object' && 'status' in error) throw error;
        throw callbackError(400, 'INVALID_JSON', '请求体不是合法JSON');
      }
    }
    throw callbackError(400, 'INVALID_JSON', '请求体不是合法JSON');
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    totalBytes += buffer.length;
    if (totalBytes > MAX_BODY_BYTES) {
      throw callbackError(413, 'PAYLOAD_TOO_LARGE', '回调请求体超过大小限制');
    }
    chunks.push(buffer);
  }
  return parseJsonText(Buffer.concat(chunks).toString('utf8'));
}

function eventTypeOf(payload: FeishuCallbackObject) {
  const header = asFeishuCallbackObject(payload.header);
  return String(header.event_type ?? payload.type ?? 'unknown');
}

function validateCardAction(payload: FeishuCallbackObject) {
  const event = asFeishuCallbackObject(payload.event);
  const action = asFeishuCallbackObject(event.action ?? payload.action);
  const value = asFeishuCallbackObject(action.value);
  const actionName = typeof value.action === 'string' ? value.action : '';
  if (!ALLOWED_CARD_ACTIONS.has(actionName)) {
    throw callbackError(400, 'UNSUPPORTED_CARD_ACTION', '不支持的卡片操作');
  }
  const hasWorkOrderId = typeof value.workOrderId === 'string' || typeof value.workOrderNo === 'string';
  const hasAlertId = typeof value.alertId === 'string';
  if (['accept_work_order', 'defer_work_order'].includes(actionName) && !hasWorkOrderId) {
    throw callbackError(400, 'WORK_ORDER_IDENTIFIER_MISSING', '卡片回调缺少工单标识');
  }
  if (['acknowledge', 'create_work_order'].includes(actionName) && !hasAlertId) {
    throw callbackError(400, 'ALERT_IDENTIFIER_MISSING', '卡片回调缺少预警标识');
  }
}

async function defaultLoadRuntime(): Promise<CallbackRuntime> {
  const module = await import('../../apps/server/src/services/feishu-callback-runtime.js');
  return module.prepareFeishuCallbackRuntime();
}

export function createFeishuCallbackHandler(options: FeishuCallbackHandlerOptions = {}) {
  const waitUntil = options.waitUntil ?? vercelWaitUntil;
  const loadRuntime = options.loadRuntime ?? defaultLoadRuntime;
  const now = options.now ?? (() => performance.now());
  const logger = options.logger ?? console;

  return async function handleFeishuCallback(request: CallbackRequest, response: CallbackResponse) {
    const startedAt = now();
    const metrics: TimingMetrics = { function_entry_ms: now() - startedAt };
    if (request.method !== 'POST') {
      sendJson(response, 405, { success: false, error: { code: 'METHOD_NOT_ALLOWED', message: '仅支持POST请求' } });
      return;
    }

    try {
      const bodyStartedAt = now();
      const envelope = await readJsonBody(request);
      metrics.body_parsed_ms = now() - bodyStartedAt;

      const decryptStartedAt = now();
      let payload = envelope;
      if (typeof envelope.encrypt === 'string') {
        const encryptKey = options.encryptKey ?? process.env.FEISHU_ENCRYPT_KEY;
        if (!encryptKey) throw callbackError(401, 'ENCRYPT_KEY_REQUIRED', '服务端尚未配置回调解密');
        try {
          payload = decryptFeishuEnvelope(envelope.encrypt, encryptKey);
        } catch {
          throw callbackError(401, 'INVALID_ENCRYPTED_EVENT', '飞书加密回调解密失败');
        }
      }
      metrics.decrypted_ms = now() - decryptStartedAt;

      const verificationStartedAt = now();
      const verificationToken = options.verificationToken ?? process.env.FEISHU_VERIFICATION_TOKEN;
      if (!verificationToken) {
        throw callbackError(503, 'EVENT_VERIFICATION_NOT_CONFIGURED', '飞书回调校验尚未配置');
      }
      const header = asFeishuCallbackObject(payload.header);
      if (!safeSecretEqual(header.token ?? payload.token, verificationToken)) {
        throw callbackError(401, 'INVALID_EVENT_SOURCE', '事件来源校验失败');
      }
      metrics.token_verified_ms = now() - verificationStartedAt;

      const challengeStartedAt = now();
      const challenge = typeof payload.challenge === 'string' ? payload.challenge : undefined;
      metrics.challenge_detected_ms = now() - challengeStartedAt;
      if (challenge !== undefined) {
        metrics.app_initialized_ms = 0;
        metrics.challenge_response_ms = now() - startedAt;
        sendJson(response, 200, { challenge });
        metrics.handler_completed_ms = now() - startedAt;
        logTiming(logger, metrics);
        return;
      }

      const eventType = eventTypeOf(payload);
      if (eventType === 'card.action.trigger') validateCardAction(payload);

      if (eventType === 'card.action.trigger') {
        sendJson(response, 200, {
          toast: { type: 'info', content: '操作已受理，正在同步工单状态' },
        });
      } else {
        sendJson(response, 200, { success: true, data: { accepted: true } });
      }
      metrics.challenge_response_ms = now() - startedAt;

      const background = Promise.resolve().then(async () => {
        const initializationStartedAt = now();
        const runtime = await loadRuntime();
        metrics.app_initialized_ms = now() - initializationStartedAt;
        await runtime.handle(payload);
        metrics.handler_completed_ms = now() - startedAt;
        logTiming(logger, metrics);
      }).catch((error: unknown) => {
        void error;
        metrics.handler_completed_ms = now() - startedAt;
        logTiming(logger, metrics);
        logger.error(`[feishu-callback-background] ${JSON.stringify({
          failed: true,
          error_code: 'BACKGROUND_HANDLER_FAILED',
          handler_completed_ms: roundMilliseconds(metrics.handler_completed_ms),
        })}`);
      });
      waitUntil(background);
    } catch (error) {
      const safeError = error !== null && typeof error === 'object' && 'status' in error && 'body' in error
        ? error as ReturnType<typeof callbackError>
        : callbackError(500, 'INTERNAL_ERROR', '回调处理暂时不可用');
      metrics.handler_completed_ms = now() - startedAt;
      sendJson(response, safeError.status, safeError.body);
      logTiming(logger, metrics);
    }
  };
}

export default createFeishuCallbackHandler();
