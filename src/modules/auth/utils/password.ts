import bcrypt from 'bcrypt';
import { passwordSchema } from '../../../shared/validators/credentials.js';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(passwordSchema.parse(password), 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!passwordSchema.safeParse(password).success) return false;
  return bcrypt.compare(password, hash);
}
