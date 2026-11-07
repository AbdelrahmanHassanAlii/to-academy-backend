import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import type { Environment } from '../../config/env.js';
import { SESSION_LIFETIME_MS } from '../../config/session.js';
import { AppError } from '../errors/app-error.js';
import { success } from '../utils/response.js';

function assertTrustedOrigin(req: Request, env: Environment): void {
  const origin = req.get('Origin');
  if (!origin || !env.ALLOWED_ORIGINS.includes(origin)) {
    throw new AppError(403, 'ORIGIN_FORBIDDEN', 'A trusted Origin is required');
  }
}

export function enforceSessionExpiry(env: Environment): RequestHandler {
  return (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.session.expiresAt !== undefined && req.session.expiresAt <= Date.now()) {
      req.session.destroy((error: unknown) => {
        res.clearCookie(env.SESSION_COOKIE_NAME, {
          httpOnly: true,
          secure: env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
        });
        next(
          error
            ? new AppError(503, 'SESSION_UNAVAILABLE', 'Session service is unavailable')
            : new AppError(401, 'SESSION_EXPIRED', 'Session has expired'),
        );
      });
      return;
    }
    next();
  };
}

export function issueCsrf(env: Environment): RequestHandler {
  return async (req, res) => {
    assertTrustedOrigin(req, env);
    req.session.csrfToken ??= randomBytes(32).toString('hex');
    req.session.expiresAt ??= Date.now() + SESSION_LIFETIME_MS;
    // Keep the original expiration on repeated token retrieval; no rolling sessions.
    req.session.cookie.expires = new Date(req.session.expiresAt);
    await new Promise<void>((resolve, reject) => {
      req.session.save((error: unknown) => {
        if (error)
          reject(new AppError(503, 'SESSION_UNAVAILABLE', 'Session service is unavailable'));
        else resolve();
      });
    });
    res.setHeader('Cache-Control', 'no-store');
    success(res, { csrfToken: req.session.csrfToken }, 'CSRF token issued');
  };
}

export function requireCsrf(env: Environment): RequestHandler {
  return (req, _res, next) => {
    assertTrustedOrigin(req, env);
    const supplied = req.get('X-CSRF-Token');
    const expected = req.session.csrfToken;
    if (
      !expected ||
      !supplied ||
      !/^[a-f0-9]{64}$/.test(supplied) ||
      !timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(supplied, 'utf8'))
    ) {
      throw new AppError(403, 'CSRF_INVALID', 'Invalid CSRF token');
    }
    next();
  };
}
