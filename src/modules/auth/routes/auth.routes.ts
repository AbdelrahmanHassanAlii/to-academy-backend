import { Router } from 'express';
import type { Environment } from '../../../config/env.js';
import type { AdminService } from '../../admins/service/admin.service.js';
import { AuthService } from '../service/auth.service.js';
import { authController } from '../controller/auth.controller.js';
import { loginSchema } from '../validators/auth.validators.js';
import { loginRateLimiters } from '../utils/login-rate-limit.js';
import { requireCsrf } from '../../../shared/middleware/csrf.js';
import { validateRequest } from '../../../shared/middleware/validate-request.js';
import { authenticate } from '../../../shared/middleware/authenticate.js';
import { authorize } from '../../../shared/middleware/authorize.js';

export function createAuthRoutes(admins: AdminService, env: Environment): Router {
  const router = Router();
  const controller = authController(new AuthService(admins), env);
  const limits = loginRateLimiters();
  router.post(
    '/login',
    limits.burst,
    requireCsrf(env),
    validateRequest(loginSchema),
    limits.ip,
    limits.account,
    controller.login,
  );
  router.get('/me', authenticate(admins, env), authorize('admin'), controller.me);
  router.post(
    '/logout',
    authenticate(admins, env),
    requireCsrf(env),
    authorize('admin'),
    controller.logout,
  );
  return router;
}
