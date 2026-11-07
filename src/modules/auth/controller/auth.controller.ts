import type { RequestHandler } from 'express';
import type { Environment } from '../../../config/env.js';
import type { AuthService } from '../service/auth.service.js';
import type { LoginInput } from '../validators/auth.validators.js';
import { destroySession, establishAdminSession } from '../utils/session-lifecycle.js';
import { success } from '../../../shared/utils/response.js';

export function authController(service: AuthService, env: Environment) {
  const login: RequestHandler = async (req, res) => {
    const admin = await service.login(res.locals.validated as LoginInput);
    await establishAdminSession(req, admin.id);
    success(res, admin, 'Login successful');
  };
  const logout: RequestHandler = async (req, res) => {
    await destroySession(req, res, env);
    success(res, null, 'Logout successful');
  };
  const me: RequestHandler = (_req, res) => {
    success(res, res.locals.admin, 'Administrator retrieved');
  };
  return { login, logout, me };
}
