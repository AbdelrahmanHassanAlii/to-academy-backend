import { Router } from 'express';
import type { Environment } from '../../../config/env.js';
import type { AdminService } from '../../admins/index.js';
import type { SettingsService } from '../service/settings.service.js';
import { settingsController } from '../controller/settings.controller.js';
import { updateSettingsSchema } from '../validators/settings.validator.js';
import { authenticate } from '../../../shared/middleware/authenticate.js';
import { authorize } from '../../../shared/middleware/authorize.js';
import { requireCsrf } from '../../../shared/middleware/csrf.js';
import { validateRequest } from '../../../shared/middleware/validate-request.js';
export function createPublicSettingsRoutes(service: SettingsService) {
  const r = Router();
  r.get('/', settingsController(service).get);
  return r;
}
export function createAdminSettingsRoutes(
  service: SettingsService,
  admins: AdminService,
  env: Environment,
) {
  const r = Router(),
    c = settingsController(service);
  r.use(authenticate(admins, env), authorize('admin'), (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  r.get('/', c.get);
  r.patch(
    '/',
    requireCsrf(env),
    validateRequest(updateSettingsSchema, 'body', 'settingsInput'),
    c.update,
  );
  return r;
}
