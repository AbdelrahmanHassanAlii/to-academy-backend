import { z } from 'zod';

const origin = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
  } catch {
    return false;
  }
}, 'Expected an exact HTTP(S) origin without path, credentials, query or trailing slash');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    PORT: z.coerce.number().int().min(1).max(65535),
    MONGODB_URI: z.string().regex(/^mongodb(?:\+srv)?:\/\/[^\s]+$/),
    SESSION_SECRET: z
      .string()
      .min(43)
      .refine(
        (value) =>
          new Set(value).size >= 12 && !/change.?me|placeholder|replace.?me|example/i.test(value),
        'Generate a random secret with at least 32 bytes of entropy',
      ),
    SESSION_COOKIE_NAME: z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/),
    PUBLIC_APP_URL: origin,
    ADMIN_APP_URL: origin,
    ALLOWED_ORIGINS: z
      .string()
      .transform((value) => value.split(',').map((item) => item.trim()))
      .pipe(z.array(origin).min(1)),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5),
  })
  .superRefine((env, context) => {
    for (const key of ['PUBLIC_APP_URL', 'ADMIN_APP_URL'] as const) {
      if (!env.ALLOWED_ORIGINS.includes(env[key])) {
        context.addIssue({
          code: 'custom',
          path: ['ALLOWED_ORIGINS'],
          message: `Must include ${key}`,
        });
      }
    }
    if (
      env.NODE_ENV === 'production' &&
      env.ALLOWED_ORIGINS.some((value) => !value.startsWith('https://'))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['ALLOWED_ORIGINS'],
        message: 'Production requires HTTPS',
      });
    }
  });

export type Environment = z.infer<typeof schema>;

export function parseEnvironment(input: Record<string, unknown>): Environment {
  const result = schema.safeParse(input);
  if (!result.success) {
    // Never interpolate raw Zod messages: those can contain actual environment values.
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid environment configuration: ${fields.join(', ')}`);
  }
  return result.data;
}
