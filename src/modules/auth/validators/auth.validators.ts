import { z } from 'zod';
import { emailSchema, passwordSchema } from '../../../shared/validators/credentials.js';

export const loginSchema = z.object({ email: emailSchema, password: passwordSchema }).strict();
export type LoginInput = z.infer<typeof loginSchema>;
