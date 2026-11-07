import { Router } from 'express';
import type { Environment } from '../../../config/env.js';
import type { AdminService } from '../../admins/index.js';
import type { LectureService } from '../service/index.js';
import { lectureController } from '../controller/index.js';
import {
  publicLectureQuerySchema,
  adminLectureQuerySchema,
  lectureSlugSchema,
  lectureIdSchema,
  createLectureSchema,
  updateLectureSchema,
} from '../validators/index.js';
import { authenticate } from '../../../shared/middleware/authenticate.js';
import { authorize } from '../../../shared/middleware/authorize.js';
import { requireCsrf } from '../../../shared/middleware/csrf.js';
import { validateRequest } from '../../../shared/middleware/validate-request.js';
export function createPublicLectureRoutes(service: LectureService) {
  const router = Router();
  const c = lectureController(service);
  router.get('/', validateRequest(publicLectureQuerySchema, 'query', 'lectureQuery'), c.listPublic);
  router.get(
    '/:slug',
    validateRequest(lectureSlugSchema, 'params', 'lectureParams'),
    c.publicDetail,
  );
  return router;
}
export function createAdminLectureRoutes(
  service: LectureService,
  admins: AdminService,
  env: Environment,
) {
  const router = Router();
  const c = lectureController(service);
  const id = validateRequest(lectureIdSchema, 'params', 'lectureParams');
  router.use(authenticate(admins, env), authorize('admin'));
  router.get('/', validateRequest(adminLectureQuerySchema, 'query', 'lectureQuery'), c.listAdmin);
  router.get('/:id', id, c.adminDetail);
  router.post(
    '/',
    requireCsrf(env),
    validateRequest(createLectureSchema, 'body', 'lectureInput'),
    c.create,
  );
  router.patch(
    '/:id',
    requireCsrf(env),
    id,
    validateRequest(updateLectureSchema, 'body', 'lectureInput'),
    c.update,
  );
  router.delete('/:id', requireCsrf(env), id, c.cancel);
  return router;
}
