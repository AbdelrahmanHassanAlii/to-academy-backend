import { Router } from 'express';
import type { Environment } from '../../../config/env.js';
import type { AdminService } from '../../admins/index.js';
import type { RegistrationService } from '../service/index.js';
import { registrationController } from '../controller/index.js';
import {
  createRegistrationSchema,
  updateRegistrationSchema,
  registrationQuerySchema,
  registrationIdSchema,
} from '../validators/index.js';
import { authenticate } from '../../../shared/middleware/authenticate.js';
import { authorize } from '../../../shared/middleware/authorize.js';
import { requireCsrf } from '../../../shared/middleware/csrf.js';
import { validateRequest } from '../../../shared/middleware/validate-request.js';
import { createRateLimiter } from '../../../shared/middleware/rate-limit.js';
import { AppError } from '../../../shared/errors/app-error.js';
export function createPublicRegistrationRoutes(service: RegistrationService, env: Environment) {
  const router = Router();
  const c = registrationController(service);
  router.post(
    '/',
    createRateLimiter({ limit: 30, windowMs: 15 * 60_000 }),
    (req, _res, next) => {
      const origin = req.get('Origin');
      if (!origin || !env.ALLOWED_ORIGINS.includes(origin))
        throw new AppError(403, 'ORIGIN_FORBIDDEN', 'A trusted Origin is required');
      if (!req.is('application/json'))
        throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json');
      next();
    },
    validateRequest(createRegistrationSchema, 'body', 'registrationInput'),
    c.create,
  );
  return router;
}
export function createAdminRegistrationRoutes(
  service: RegistrationService,
  admins: AdminService,
  env: Environment,
) {
  const router = Router();
  const c = registrationController(service);
  const query = validateRequest(registrationQuerySchema, 'query', 'registrationQuery');
  const id = validateRequest(registrationIdSchema, 'params', 'registrationParams');
  router.use(authenticate(admins, env), authorize('admin'));
  router.get('/', query, c.list);
  router.get('/export', query, c.exportCsv);
  router.get('/:id', id, c.detail);
  router.patch(
    '/:id',
    requireCsrf(env),
    id,
    validateRequest(updateRegistrationSchema, 'body', 'registrationInput'),
    c.update,
  );
  return router;
}
