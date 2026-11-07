import { z } from 'zod';
import { ARTICLE_STATUSES } from '../utils/article.utils.js';
import {
  courseSlugValueSchema,
  courseIdSchema,
  courseSlugSchema,
  publicCourseQuerySchema,
} from '../../courses/validators/index.js';
export const articleIdSchema = courseIdSchema;
export const articleSlugSchema = courseSlugSchema;
const localized = (max: number) =>
  z
    .object({
      ar: z.string().trim().min(1).max(max),
      en: z.string().trim().min(1).max(max).optional(),
    })
    .strict();
export const createArticleSchema = z
  .object({
    title: localized(200),
    slug: courseSlugValueSchema.optional(),
    excerpt: localized(600).optional(),
    content: localized(30000).optional(),
    thumbnail: z
      .string()
      .regex(/^[a-f0-9]{24}$/i)
      .nullable()
      .optional(),
    author: z.string().trim().min(1).max(200).optional(),
    status: z.enum(ARTICLE_STATUSES).optional(),
    featured: z.boolean().optional(),
    seo: z
      .object({ title: localized(200).optional(), description: localized(600).optional() })
      .strict()
      .optional(),
  })
  .strict();
export const updateArticleSchema = createArticleSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'At least one field is required');
export const publicArticleQuerySchema = publicCourseQuerySchema.omit({ category: true });
export const adminArticleQuerySchema = publicArticleQuerySchema.extend({
  status: z.enum(ARTICLE_STATUSES).optional(),
});
export type CreateArticleInput = z.infer<typeof createArticleSchema>;
export type UpdateArticleInput = z.infer<typeof updateArticleSchema>;
export type ArticleQuery = z.infer<typeof adminArticleQuerySchema>;
