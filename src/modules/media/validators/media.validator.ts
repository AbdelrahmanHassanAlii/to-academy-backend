import { z } from 'zod';
export const mediaIdSchema = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/i) }).strict();
export const visibilitySchema = z.enum(['private', 'public']);
export const mediaQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    visibility: visibilitySchema.optional(),
  })
  .strict();
export type MediaQuery = z.infer<typeof mediaQuerySchema>;
