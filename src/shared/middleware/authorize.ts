import type { RequestHandler } from 'express';
import type { AdminProfile } from '../../modules/admins/utils/admin-profile.js';
import { AppError } from '../errors/app-error.js';

export function authorize(...roles: AdminProfile['role'][]): RequestHandler {
  return (_req, res, next) => {
    const admin = res.locals.admin as AdminProfile | undefined;
    if (!admin) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    if (!roles.includes(admin.role)) throw new AppError(403, 'FORBIDDEN', 'Access denied');
    next();
  };
}
