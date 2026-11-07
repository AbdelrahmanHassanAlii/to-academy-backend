import type { CorsOptions } from 'cors';
import type { Environment } from './env.js';
import { AppError } from '../shared/errors/app-error.js';

export function corsOptions(env: Environment): CorsOptions {
  return {
    origin: (origin, callback) => {
      if (!origin || env.ALLOWED_ORIGINS.includes(origin)) callback(null, true);
      else callback(new AppError(403, 'ORIGIN_FORBIDDEN', 'Origin is not allowed'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  };
}
