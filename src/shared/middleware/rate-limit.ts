import { rateLimit } from 'express-rate-limit';

export function createRateLimiter(options: { limit: number; windowMs: number }) {
  return rateLimit({
    ...options,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      res
        .status(429)
        .json({ success: false, message: 'Too many requests', code: 'RATE_LIMITED', errors: [] });
    },
  });
}
