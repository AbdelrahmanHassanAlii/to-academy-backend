import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z
  .string()
  .min(12)
  .refine(
    (value) => Buffer.byteLength(value, 'utf8') <= 72 && !value.includes('\0'),
    'Password must be 12 or more characters, at most 72 UTF-8 bytes, without NUL characters',
  );
