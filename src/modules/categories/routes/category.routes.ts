import { Router } from 'express';
import type { Environment } from '../../../config/env.js';
import type { AdminService } from '../../admins/service/admin.service.js';
import type { CategoryService } from '../service/index.js';
import { categoryController } from '../controller/index.js';
import {
  adminCategoryQuerySchema,
  publicCategoryQuerySchema,
  categoryIdSchema,
  categorySlugSchema,
  createCategorySchema,
  updateCategorySchema,
} from '../validators/index.js';
import { authenticate } from '../../../shared/middleware/authenticate.js';
import { authorize } from '../../../shared/middleware/authorize.js';
import { requireCsrf } from '../../../shared/middleware/csrf.js';
import { validateRequest } from '../../../shared/middleware/validate-request.js';

export function createPublicCategoryRoutes(service: CategoryService): Router {
  const router = Router();
  const controller = categoryController(service);
  router.get(
    '/',
    validateRequest(publicCategoryQuerySchema, 'query', 'categoryQuery'),
    controller.listPublic,
  );
  router.get(
    '/:slug',
    validateRequest(categorySlugSchema, 'params', 'categoryParams'),
    controller.publicDetail,
  );
  return router;
}

export function createAdminCategoryRoutes(
  service: CategoryService,
  admins: AdminService,
  env: Environment,
): Router {
  const router = Router();
  const controller = categoryController(service);
  const id = validateRequest(categoryIdSchema, 'params', 'categoryParams');
  router.use(authenticate(admins, env), authorize('admin'));
  router.get(
    '/',
    validateRequest(adminCategoryQuerySchema, 'query', 'categoryQuery'),
    controller.listAdmin,
  );
  router.get('/:id', id, controller.adminDetail);
  router.post(
    '/',
    requireCsrf(env),
    validateRequest(createCategorySchema, 'body', 'categoryInput'),
    controller.create,
  );
  router.patch(
    '/:id',
    requireCsrf(env),
    id,
    validateRequest(updateCategorySchema, 'body', 'categoryInput'),
    controller.update,
  );
  router.delete('/:id', requireCsrf(env), id, controller.deactivate);
  return router;
}
