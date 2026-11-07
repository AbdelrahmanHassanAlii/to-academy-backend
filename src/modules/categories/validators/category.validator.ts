import { z } from 'zod';
import { CATEGORY_SLUG_PATTERN, normalizeCategorySlug } from '../utils/index.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
export const categorySlugValueSchema = z
  .string()
  .transform(normalizeCategorySlug)
  .pipe(z.string().min(1).max(120).regex(CATEGORY_SLUG_PATTERN));
const name = z
  .object({
    ar: z.string().trim().min(1).max(120),
    en: z.string().trim().min(1).max(120).optional(),
  })
  .strict();
const description = z
  .object({
    ar: z.string().trim().max(4000).optional(),
    en: z.string().trim().max(4000).optional(),
  })
  .strict();
export const createCategorySchema = z
  .object({
    name,
    slug: categorySlugValueSchema.optional(),
    description: description.optional(),
    image: objectId.nullable().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(1_000_000).optional(),
  })
  .strict();
export const updateCategorySchema = createCategorySchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export const categoryIdSchema = z.object({ id: objectId }).strict();
export const categorySlugSchema = z.object({ slug: categorySlugValueSchema }).strict();
const page = z
  .string()
  .regex(/^[1-9]\d*$/)
  .default('1')
  .transform(Number)
  .pipe(z.number().int().max(100_000));
const limit = (fallback: string) =>
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .default(fallback)
    .transform(Number)
    .pipe(z.number().int().max(100));
const q = z.string().trim().min(1).max(100).optional();
export const publicCategoryQuerySchema = z.object({ page, limit: limit('12'), q }).strict();
export const adminCategoryQuerySchema = z
  .object({
    page,
    limit: limit('20'),
    q,
    isActive: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  })
  .strict();
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CategoryQuery = z.infer<typeof adminCategoryQuerySchema>;
