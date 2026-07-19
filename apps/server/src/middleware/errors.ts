import type { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}

export function notFound(req: Request, _res: Response, next: NextFunction) {
  next(new AppError(404, 'NOT_FOUND', `接口不存在：${req.method} ${req.path}`));
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof SyntaxError && 'type' in error && error.type === 'entity.parse.failed') {
    res.status(400).json({ success: false, error: { code: 'INVALID_JSON', message: '请求体不是合法 JSON' } });
    return;
  }
  if (error instanceof ZodError) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: '请求参数校验失败', details: error.flatten() } });
    return;
  }
  const appError = error instanceof AppError ? error : new AppError(500, 'INTERNAL_ERROR', '服务暂时不可用，请稍后重试');
  res.status(appError.status).json({ success: false, error: { code: appError.code, message: appError.message, details: appError.details } });
};
