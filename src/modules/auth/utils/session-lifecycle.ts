import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import type { Environment } from '../../../config/env.js';
import { SESSION_LIFETIME_MS } from '../../../config/session.js';
import { AppError } from '../../../shared/errors/app-error.js';

const unavailable = () =>
  new AppError(503, 'SESSION_UNAVAILABLE', 'Session service is unavailable');

export function clearSessionCookie(res: Response, env: Environment): void {
  res.clearCookie(env.SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

export async function destroySession(req: Request, res: Response, env: Environment): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    req.session.destroy((error: unknown) => {
      if (error) reject(unavailable());
      else resolve();
    });
  });
  clearSessionCookie(res, env);
}

export async function establishAdminSession(req: Request, adminId: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((error: unknown) => {
      if (error) reject(unavailable());
      else resolve();
    });
  });
  req.session.adminId = adminId;
  req.session.csrfToken = randomBytes(32).toString('hex');
  req.session.expiresAt = Date.now() + SESSION_LIFETIME_MS;
  req.session.cookie.maxAge = SESSION_LIFETIME_MS;
  await new Promise<void>((resolve, reject) => {
    req.session.save((error: unknown) => {
      if (!error) {
        resolve();
        return;
      }
      // Never let express-session auto-save a privileged session after an explicit save failure.
      req.session.destroy(() => {
        reject(unavailable());
      });
    });
  });
}
