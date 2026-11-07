import type { RequestHandler } from 'express';
import type { AdminService } from '../../modules/admins/service/admin.service.js';
import type { Environment } from '../../config/env.js';
import { destroySession } from '../../modules/auth/utils/session-lifecycle.js';
import { AppError } from '../errors/app-error.js';

export function authenticate(admins: AdminService, env: Environment): RequestHandler {
  return async (req, res, next) => {
    if (!req.session.adminId) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    if (
      typeof req.session.adminId !== 'string' ||
      !req.session.expiresAt ||
      req.session.expiresAt <= Date.now()
    ) {
      await destroySession(req, res, env);
      throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    }
    const admin = await admins.getActiveById(req.session.adminId);
    if (!admin) {
      await destroySession(req, res, env);
      throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    }
    res.locals.admin = admin;
    next();
  };
}
