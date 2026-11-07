import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../errors/app-error.js';

export function validateRequest(
  schema: ZodType,
  source: 'body' | 'query' | 'params' = 'body',
): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(
        new AppError(
          400,
          'VALIDATION_ERROR',
          'Validation failed',
          result.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: 'Invalid value',
            code: issue.code,
          })),
        ),
      );
      return;
    }
    // Express 5 query is a getter. Do not mutate req.query or silently trust the unparsed input.
    res.locals.validated = result.data;
    next();
  };
}
