import { z } from 'zod';
import { emailSchema, passwordSchema } from '../../../shared/validators/credentials.js';

const nameSchema = z.string().trim().min(2).max(120);
export const initialAdminSchema = z
  .object({ name: nameSchema, email: emailSchema, password: passwordSchema })
  .strict();
export const profileUpdateSchema = z.object({ name: nameSchema }).strict();
export type InitialAdminInput = z.infer<typeof initialAdminSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
