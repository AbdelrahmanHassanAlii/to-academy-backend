import { createHash } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import type { LoginInput } from '../validators/auth.validators.js';
import { createRateLimiter } from '../../../shared/middleware/rate-limit.js';

export function loginRateLimiters() {
  const options = {
    windowMs: 15 * 60_000,
    limit: 5,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8' as const,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests', code: 'RATE_LIMITED', errors: [] },
  };
  return {
    burst: createRateLimiter({ limit: 60, windowMs: 60_000 }),
    ip: rateLimit({ ...options, identifier: 'login-ip' }),
    account: rateLimit({
      ...options,
      identifier: 'login-account',
      keyGenerator: (_req, res) => {
        const input = res.locals.validated as LoginInput;
        return createHash('sha256').update(input.email).digest('hex');
      },
    }),
  };
}
