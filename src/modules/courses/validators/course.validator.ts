import { z } from 'zod';
import {
  COURSE_STATUSES,
  TRAINING_MODES,
  COURSE_SLUG_PATTERN,
  normalizeCourseSlug,
} from '../utils/index.js';
const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
const localized = (max: number) =>
  z
    .object({
      ar: z.string().trim().min(1).max(max),
      en: z.string().trim().min(1).max(max).optional(),
    })
    .strict();
export const courseSlugValueSchema = z
  .string()
  .transform(normalizeCourseSlug)
  .pipe(
    z
      .string()
      .min(1)
      .max(120)
      .regex(COURSE_SLUG_PATTERN)
      .refine((value) => value !== 'featured', 'Reserved slug'),
  );
export const createCourseSchema = z
  .object({
    title: localized(200),
    slug: courseSlugValueSchema.optional(),
    shortDescription: localized(600).optional(),
    description: localized(30000).optional(),
    category: objectId,
    thumbnail: objectId.nullable().optional(),
    curriculum: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(200),
            topics: z.array(z.string().trim().min(1).max(500)).max(50),
          })
          .strict(),
      )
      .max(100)
      .optional(),
    lectureCount: z.number().int().min(0).max(10000).optional(),
    duration: z.string().trim().min(1).max(120).optional(),
    targetAudience: z.array(z.string().trim().min(1).max(300)).max(50).optional(),
    trainingMode: z.enum(TRAINING_MODES).optional(),
    price: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable().optional(),
    currency: z.literal('EGP').optional(),
    isFree: z.boolean().optional(),
    status: z.enum(COURSE_STATUSES).optional(),
    featured: z.boolean().optional(),
    seo: z
      .object({ title: localized(200).optional(), description: localized(600).optional() })
      .strict()
      .optional(),
  })
  .strict();
export const updateCourseSchema = createCourseSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export const courseIdSchema = z.object({ id: objectId }).strict();
export const courseSlugSchema = z.object({ slug: courseSlugValueSchema }).strict();
const page = z
  .string()
  .regex(/^[1-9]\d*$/)
  .default('1')
  .transform(Number)
  .pipe(z.number().int().max(100000));
const limit = (fallback: string) =>
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .default(fallback)
    .transform(Number)
    .pipe(z.number().int().max(100));
const filters = {
  page,
  category: objectId.optional(),
  q: z.string().trim().min(1).max(100).optional(),
  featured: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  sort: z.enum(['newest', 'oldest', 'title']).default('newest'),
};
export const publicCourseQuerySchema = z
  .object({
    ...filters,
    category: z
      .string()
      .transform(normalizeCourseSlug)
      .pipe(z.string().min(1).max(120).regex(COURSE_SLUG_PATTERN))
      .optional(),
    limit: limit('12'),
  })
  .strict();
export const adminCourseQuerySchema = z
  .object({ ...filters, limit: limit('20'), status: z.enum(COURSE_STATUSES).optional() })
  .strict();
export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type CourseQuery = z.infer<typeof adminCourseQuerySchema>;
