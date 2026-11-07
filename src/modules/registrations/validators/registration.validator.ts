import { z } from 'zod';
import { normalizePhone, REGISTRATION_STATUSES } from '../utils/index.js';
const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
const phone = z.string().trim().min(1).max(50).transform(normalizePhone).pipe(z.string());
export const createRegistrationSchema = z
  .object({
    fullName: z.string().trim().min(2).max(200),
    phone,
    email: z
      .email()
      .max(254)
      .transform((value) => value.toLowerCase())
      .optional(),
    targetType: z.enum(['lecture', 'course']),
    targetId: objectId,
    privacyConsent: z.literal(true),
  })
  .strict();
export const updateRegistrationSchema = z
  .object({
    status: z.enum(REGISTRATION_STATUSES).optional(),
    administrativeNotes: z.string().trim().max(5000).optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, 'At least one field is required');
export const registrationIdSchema = z.object({ id: objectId }).strict();
const positive = (fallback: string, max: number) =>
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .default(fallback)
    .transform(Number)
    .pipe(z.number().int().max(max));
export const registrationQuerySchema = z
  .object({
    page: positive('1', 100000),
    limit: positive('20', 100),
    targetType: z.enum(['lecture', 'course']).optional(),
    lecture: objectId.optional(),
    course: objectId.optional(),
    status: z.enum(REGISTRATION_STATUSES).optional(),
    q: z.string().trim().min(1).max(100).optional(),
    sort: z.enum(['newest', 'oldest']).default('newest'),
  })
  .strict()
  .refine(
    (input) =>
      !(input.lecture && input.course) &&
      !(input.targetType === 'lecture' && input.course) &&
      !(input.targetType === 'course' && input.lecture),
    'Inconsistent target filters',
  );
export type CreateRegistrationInput = z.infer<typeof createRegistrationSchema>;
export type UpdateRegistrationInput = z.infer<typeof updateRegistrationSchema>;
export type RegistrationQuery = z.infer<typeof registrationQuerySchema>;
