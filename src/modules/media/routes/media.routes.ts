import { Router } from 'express';
import type { Environment } from '../../../config/env.js';
import type { AdminService } from '../../admins/index.js';
import type { MediaService } from '../service/media.service.js';
import { mediaController } from '../controller/media.controller.js';
import { mediaIdSchema, mediaQuerySchema } from '../validators/media.validator.js';
import { authenticate } from '../../../shared/middleware/authenticate.js';
import { authorize } from '../../../shared/middleware/authorize.js';
import { requireCsrf } from '../../../shared/middleware/csrf.js';
import { validateRequest } from '../../../shared/middleware/validate-request.js';
import { createRateLimiter } from '../../../shared/middleware/rate-limit.js';
const id = () => validateRequest(mediaIdSchema, 'params', 'mediaParams');
export function createPublicMediaRoutes(service: MediaService) {
  const router = Router();
  router.get('/:id', id(), mediaController(service).publicDownload);
  return router;
}
export function createAdminMediaRoutes(
  service: MediaService,
  admins: AdminService,
  env: Environment,
) {
  const router = Router();
  const c = mediaController(service);
  router.use(authenticate(admins, env), authorize('admin'), (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/', validateRequest(mediaQuerySchema, 'query', 'mediaQuery'), c.list);
  router.get('/:id/content', id(), c.adminDownload);
  router.get('/:id', id(), c.detail);
  router.post(
    '/',
    requireCsrf(env),
    createRateLimiter({ windowMs: 15 * 60 * 1000, limit: 30 }),
    c.upload,
  );
  router.delete('/:id', requireCsrf(env), id(), c.remove);
  return router;
}
