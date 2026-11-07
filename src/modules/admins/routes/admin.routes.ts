import { Router } from 'express';
import type { Environment } from '../../../config/env.js';
import type { AdminService } from '../service/admin.service.js';
import { adminController } from '../controller/admin.controller.js';
import { profileUpdateSchema } from '../validators/admin.validators.js';
import { authenticate } from '../../../shared/middleware/authenticate.js';
import { authorize } from '../../../shared/middleware/authorize.js';
import { requireCsrf } from '../../../shared/middleware/csrf.js';
import { validateRequest } from '../../../shared/middleware/validate-request.js';

export function createAdminRoutes(admins: AdminService, env: Environment): Router {
  const router = Router();
  const controller = adminController(admins);
  router.use(authenticate(admins, env), authorize('admin'));
  router.get('/me', controller.me);
  router.patch('/me', requireCsrf(env), validateRequest(profileUpdateSchema), controller.update);
  return router;
}
