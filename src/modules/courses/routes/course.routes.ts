import { Router } from 'express';
import type { Environment } from '../../../config/env.js';
import type { AdminService } from '../../admins/service/admin.service.js';
import type { CourseService } from '../service/index.js';
import { courseController } from '../controller/index.js';
import {
  adminCourseQuerySchema,
  publicCourseQuerySchema,
  courseIdSchema,
  courseSlugSchema,
  createCourseSchema,
  updateCourseSchema,
} from '../validators/index.js';
import { authenticate } from '../../../shared/middleware/authenticate.js';
import { authorize } from '../../../shared/middleware/authorize.js';
import { requireCsrf } from '../../../shared/middleware/csrf.js';
import { validateRequest } from '../../../shared/middleware/validate-request.js';

export function createPublicCourseRoutes(service: CourseService): Router {
  const router = Router();
  const controller = courseController(service);
  router.get(
    '/featured',
    validateRequest(publicCourseQuerySchema, 'query', 'courseQuery'),
    controller.featured,
  );
  router.get(
    '/',
    validateRequest(publicCourseQuerySchema, 'query', 'courseQuery'),
    controller.listPublic,
  );
  router.get(
    '/:slug',
    validateRequest(courseSlugSchema, 'params', 'courseParams'),
    controller.publicDetail,
  );
  return router;
}

export function createAdminCourseRoutes(
  service: CourseService,
  admins: AdminService,
  env: Environment,
): Router {
  const router = Router();
  const controller = courseController(service);
  const id = validateRequest(courseIdSchema, 'params', 'courseParams');
  router.use(authenticate(admins, env), authorize('admin'));
  router.get(
    '/',
    validateRequest(adminCourseQuerySchema, 'query', 'courseQuery'),
    controller.listAdmin,
  );
  router.get('/:id', id, controller.adminDetail);
  router.post(
    '/',
    requireCsrf(env),
    validateRequest(createCourseSchema, 'body', 'courseInput'),
    controller.create,
  );
  router.patch(
    '/:id',
    requireCsrf(env),
    id,
    validateRequest(updateCourseSchema, 'body', 'courseInput'),
    controller.update,
  );
  router.delete('/:id', requireCsrf(env), id, controller.archive);
  return router;
}
