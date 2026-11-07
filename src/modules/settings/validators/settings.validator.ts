import { z } from 'zod';
import { normalizePhone } from '../../registrations/utils/index.js';
const localized = (max: number) =>
  z
    .object({
      ar: z.string().trim().min(1).max(max),
      en: z.string().trim().min(1).max(max).optional(),
    })
    .strict();
const phone = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .transform(normalizePhone)
  .pipe(z.string())
  .nullable();
const url = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password;
    } catch {
      return false;
    }
  }, 'Use an HTTP(S) URL without credentials');
export const updateSettingsSchema = z
  .object({
    academyName: localized(200).optional(),
    about: localized(10000).nullable().optional(),
    logo: z
      .string()
      .regex(/^[a-f0-9]{24}$/i)
      .nullable()
      .optional(),
    contactPhone: phone.optional(),
    whatsappNumber: phone.optional(),
    contactEmail: z.email().max(254).toLowerCase().nullable().optional(),
    address: localized(1000).nullable().optional(),
    footer: localized(1000).nullable().optional(),
    socialLinks: z
      .object({
        facebook: url.optional(),
        instagram: url.optional(),
        linkedin: url.optional(),
        youtube: url.optional(),
        tiktok: url.optional(),
        x: url.optional(),
      })
      .strict()
      .optional(),
    defaultSeo: z
      .object({ title: localized(200).optional(), description: localized(600).optional() })
      .strict()
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export type UpdateSettingsInput = z.input<typeof updateSettingsSchema>;
