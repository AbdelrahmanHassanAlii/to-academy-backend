import { Router } from 'express';
import type { Environment } from '../config/env.js';
import { issueCsrf } from '../shared/middleware/csrf.js';
import { createRateLimiter } from '../shared/middleware/rate-limit.js';

export function createSessionRoutes(env: Environment): Router {
  const router = Router();
  router.get('/auth/csrf', createRateLimiter({ limit: 60, windowMs: 60_000 }), issueCsrf(env));
  return router;
}
