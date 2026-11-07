import { z } from 'zod';
import { courseSlugValueSchema } from '../../courses/validators/index.js';
import { LECTURE_STATUSES } from '../utils/index.js';
export const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
const localized = (max: number) =>
  z
    .object({
      ar: z.string().trim().min(1).max(max),
      en: z.string().trim().min(1).max(max).optional(),
    })
    .strict();
const date = z.iso.datetime({ offset: true });
const meeting = z
  .url()
  .max(2000)
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  }, 'Use an HTTPS URL without credentials');
export const createLectureSchema = z
  .object({
    title: localized(200),
    slug: courseSlugValueSchema.optional(),
    shortDescription: localized(600).optional(),
    description: localized(30000).optional(),
    course: objectId.nullable().optional(),
    scheduledAt: date,
    durationMinutes: z.number().int().positive().max(1440),
    capacity: z.number().int().positive().max(100000).nullable().optional(),
    registrationDeadline: date.nullable().optional(),
    thumbnail: objectId.nullable().optional(),
    meetingUrl: meeting.nullable().optional(),
    status: z.enum(LECTURE_STATUSES).optional(),
    seo: z
      .object({ title: localized(200).optional(), description: localized(600).optional() })
      .strict()
      .optional(),
  })
  .strict();
export const updateLectureSchema = createLectureSchema
  .partial()
  .refine((input) => Object.keys(input).length > 0, 'At least one field is required');
export const lectureIdSchema = z.object({ id: objectId }).strict();
export const lectureSlugSchema = z.object({ slug: courseSlugValueSchema }).strict();
const positiveQuery = (fallback: string, max: number) =>
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .default(fallback)
    .transform(Number)
    .pipe(z.number().int().max(max));
export const publicLectureQuerySchema = z
  .object({
    page: positiveQuery('1', 100000),
    limit: positiveQuery('12', 100),
    q: z.string().trim().min(1).max(100).optional(),
    course: objectId.optional(),
    period: z.enum(['upcoming', 'past']).optional(),
    sort: z.enum(['schedule', 'latest', 'newest', 'oldest', 'title']).default('schedule'),
  })
  .strict();
export const adminLectureQuerySchema = publicLectureQuerySchema.extend({
  limit: positiveQuery('20', 100),
  status: z.enum(LECTURE_STATUSES).optional(),
});
export type CreateLectureInput = z.infer<typeof createLectureSchema>;
export type UpdateLectureInput = z.infer<typeof updateLectureSchema>;
export type LectureQuery = z.infer<typeof adminLectureQuerySchema>;
