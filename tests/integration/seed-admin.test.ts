import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Database } from '../../src/config/database.js';
import { createLogger } from '../../src/infrastructure/logging/logger.js';
import { createAdminModel } from '../../src/modules/admins/model/admin.model.js';
import { verifyPassword } from '../../src/modules/auth/utils/password.js';

const uri = process.env.TEST_MONGODB_URI;
if (!uri || !/^to_academy_test(?:_[a-z0-9]+)?$/.test(new URL(uri).pathname.slice(1)))
  throw new Error('Dedicated TEST_MONGODB_URI is required');
const db = new Database(createLogger('silent'));
const model = createAdminModel(db.connection);
const email = `seed-${randomUUID()}@example.com`;
const password = randomBytes(24).toString('base64url');
const run = promisify(execFile);
async function seed(overrides: Record<string, string | undefined> = {}, args: string[] = []) {
  const childEnv = {
    ...process.env,
    MONGODB_URI: uri,
    SEED_ADMIN_NAME: 'Seed test administrator',
    SEED_ADMIN_EMAIL: email,
    SEED_ADMIN_PASSWORD: password,
    ...overrides,
  };
  try {
    // npm echoes forwarded arguments before the CLI can reject them. Test that guard
    // directly; valid provisioning still exercises the actual npm script.
    const command =
      process.env.npm_execpath && args.length === 0
        ? [process.env.npm_execpath, 'run', 'seed:admin', ...(args.length ? ['--', ...args] : [])]
        : ['--import', 'tsx', 'scripts/seed-admin.ts', ...args];
    const result = await run(process.execPath, command, { env: childEnv, timeout: 10_000 });
    return { code: 0, output: result.stdout + result.stderr };
  } catch (error) {
    const result = error as { code: number; stdout: string; stderr: string };
    return { code: result.code, output: result.stdout + result.stderr };
  }
}
beforeAll(async () => {
  await db.connect(uri);
});
afterAll(async () => {
  try {
    if (db.connection.readyState === 1) await model.deleteOne({ email });
  } finally {
    await db.disconnect();
  }
});

describe('controlled seed CLI', () => {
  it('creates a bcrypt administrator without printing credentials and refuses duplicates', async () => {
    const first = await seed();
    expect(first.code).toBe(0);
    expect(first.output).toContain('Administrator created');
    expect(first.output).not.toContain(password);
    expect(first.output).not.toContain(email);
    const admin = await model.findOne({ email }).select('+passwordHash');
    expect(admin).not.toBeNull();
    expect(await verifyPassword(password, admin!.passwordHash)).toBe(true);
    const duplicate = await seed({ SEED_ADMIN_EMAIL: email.toUpperCase() });
    expect(duplicate.code).not.toBe(0);
    expect(duplicate.output).toContain('ADMIN_EXISTS');
    expect(duplicate.output).not.toContain(password);
    expect(duplicate.output).not.toContain(admin!.passwordHash);
    expect(await model.countDocuments({ email })).toBe(1);
  });
  it('fails closed on missing/invalid input and positional credentials', async () => {
    const missing = await seed({ SEED_ADMIN_PASSWORD: '' });
    expect(missing.code).not.toBe(0);
    expect(missing.output).toContain('SEED_INPUT_INVALID');
    const invalid = await seed({ SEED_ADMIN_PASSWORD: 'short' });
    expect(invalid.code).not.toBe(0);
    expect(invalid.output).not.toContain('short');
    const positional = await seed({}, ['forbidden-password-argument']);
    expect(positional.code).not.toBe(0);
    expect(positional.output).toContain('SEED_ARGUMENTS_FORBIDDEN');
    expect(positional.output).not.toContain('forbidden-password-argument');
  });
});
