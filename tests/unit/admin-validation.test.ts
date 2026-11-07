import { describe, expect, it } from 'vitest';
import {
  initialAdminSchema,
  profileUpdateSchema,
} from '../../src/modules/admins/validators/admin.validators.js';
import { loginSchema } from '../../src/modules/auth/validators/auth.validators.js';
import { hashPassword, verifyPassword } from '../../src/modules/auth/utils/password.js';

describe('administrator credential validation', () => {
  const fixture = () => ({
    name: '  مسؤول الأكاديمية  ',
    email: ' OWNER@Example.com ',
    password: 'Test-only-long-password-43',
  });
  it('normalizes name/email but preserves password whitespace', () => {
    const parsed = initialAdminSchema.parse({ ...fixture(), password: '  Test-only-password  ' });
    expect(parsed.name).toBe('مسؤول الأكاديمية');
    expect(parsed.email).toBe('owner@example.com');
    expect(parsed.password).toBe('  Test-only-password  ');
    expect(
      loginSchema.parse({ email: ' OWNER@Example.com ', password: parsed.password }).email,
    ).toBe('owner@example.com');
  });
  it.each(['short', 'a'.repeat(73), 'ع'.repeat(37), 'valid-prefix\u0000invalid-suffix'])(
    'rejects unsafe password length/content case %#',
    (password) => {
      expect(initialAdminSchema.safeParse({ ...fixture(), password }).success).toBe(false);
      expect(loginSchema.safeParse({ email: fixture().email, password }).success).toBe(false);
    },
  );
  it('rejects untrusted identity/role changes and invalid email', () => {
    expect(loginSchema.safeParse({ ...fixture(), role: 'admin' }).success).toBe(false);
    expect(initialAdminSchema.safeParse({ ...fixture(), email: 'invalid' }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ name: 'Owner', role: 'admin' }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({}).success).toBe(false);
  });
  it('hashes with bcrypt and verifies only the exact password', async () => {
    const password = fixture().password;
    const hash = await hashPassword(password);
    expect(hash).not.toBe(password);
    expect(hash).toMatch(/^\$2[ab]\$12\$/);
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword(`${password}x`, hash)).toBe(false);
  });
});
