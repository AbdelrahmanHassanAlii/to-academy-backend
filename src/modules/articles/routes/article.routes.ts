import { Router } from 'express';
import type { Environment } from '../../../config/env.js';
import type { AdminService } from '../../admins/index.js';
import type { ArticleService } from '../service/article.service.js';
import { articleController } from '../controller/article.controller.js';
import {
  publicArticleQuerySchema,
  adminArticleQuerySchema,
  articleIdSchema,
  articleSlugSchema,
  createArticleSchema,
  updateArticleSchema,
} from '../validators/article.validator.js';
import { authenticate } from '../../../shared/middleware/authenticate.js';
import { authorize } from '../../../shared/middleware/authorize.js';
import { requireCsrf } from '../../../shared/middleware/csrf.js';
import { validateRequest } from '../../../shared/middleware/validate-request.js';
export function createPublicArticleRoutes(service: ArticleService) {
  const r = Router(),
    c = articleController(service);
  r.get('/', validateRequest(publicArticleQuerySchema, 'query', 'articleQuery'), c.listPublic);
  r.get('/:slug', validateRequest(articleSlugSchema, 'params', 'articleParams'), c.publicDetail);
  return r;
}
export function createAdminArticleRoutes(
  service: ArticleService,
  admins: AdminService,
  env: Environment,
) {
  const r = Router(),
    c = articleController(service),
    id = validateRequest(articleIdSchema, 'params', 'articleParams');
  r.use(authenticate(admins, env), authorize('admin'), (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  r.get('/', validateRequest(adminArticleQuerySchema, 'query', 'articleQuery'), c.listAdmin);
  r.get('/:id', id, c.adminDetail);
  r.post(
    '/',
    requireCsrf(env),
    validateRequest(createArticleSchema, 'body', 'articleInput'),
    c.create,
  );
  r.patch(
    '/:id',
    requireCsrf(env),
    id,
    validateRequest(updateArticleSchema, 'body', 'articleInput'),
    c.update,
  );
  r.delete('/:id', requireCsrf(env), id, c.archive);
  return r;
}
