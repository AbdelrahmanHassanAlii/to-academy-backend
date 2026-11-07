import type { ErrorRequestHandler } from 'express';
import type { Logger } from 'pino';
import { AppError } from '../errors/app-error.js';

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    let safe = error instanceof AppError ? error : undefined;
    if (typeof error === 'object' && error !== null && 'type' in error) {
      if (error.type === 'entity.parse.failed')
        safe = new AppError(400, 'INVALID_JSON', 'Invalid JSON body');
      if (error.type === 'entity.too.large')
        safe = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
      if (error.type === 'charset.unsupported' || error.type === 'encoding.unsupported')
        safe = new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported request body encoding');
    }
    safe ??= new AppError(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
    if (safe.status >= 500) {
      // Raw errors may contain DB credentials, PII or request bodies; log an allowlisted code only.
      logger.error({ code: safe.code, requestId: res.getHeader('X-Request-Id') }, 'Request failed');
    }
    res
      .status(safe.status)
      .json({ success: false, message: safe.message, code: safe.code, errors: safe.errors });
  };
}
