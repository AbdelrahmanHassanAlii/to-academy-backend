import { Database } from '../src/config/database.js';
import { createLogger } from '../src/infrastructure/logging/logger.js';
import { createAdminModel } from '../src/modules/admins/model/admin.model.js';
import { AdminService } from '../src/modules/admins/service/admin.service.js';
import { initialAdminSchema } from '../src/modules/admins/validators/admin.validators.js';
import { AppError } from '../src/shared/errors/app-error.js';

async function main(): Promise<void> {
  if (process.argv.length > 2) {
    console.error(
      'SEED_ARGUMENTS_FORBIDDEN: use private environment inputs, never positional credentials',
    );
    process.exitCode = 1;
    return;
  }
  const input = {
    name: process.env.SEED_ADMIN_NAME,
    email: process.env.SEED_ADMIN_EMAIL,
    password: process.env.SEED_ADMIN_PASSWORD,
  };
  delete process.env.SEED_ADMIN_NAME;
  delete process.env.SEED_ADMIN_EMAIL;
  delete process.env.SEED_ADMIN_PASSWORD;
  const parsed = initialAdminSchema.safeParse(input);
  if (!parsed.success) {
    console.error(
      'SEED_INPUT_INVALID: supply valid SEED_ADMIN_NAME, SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD',
    );
    process.exitCode = 1;
    return;
  }
  const uri = process.env.MONGODB_URI;
  if (!uri || !/^mongodb(?:\+srv)?:\/\/[^\s]+$/.test(uri)) {
    console.error('SEED_CONFIG_INVALID: MONGODB_URI is required');
    process.exitCode = 1;
    return;
  }
  const db = new Database(createLogger('silent'));
  try {
    await db.connect(uri);
    const service = new AdminService(createAdminModel(db.connection));
    await service.ensureIndexes();
    await service.createInitialAdmin(parsed.data);
    console.log('Administrator created');
  } catch (error) {
    // Never log raw input, errors, duplicate-key details or password hashes.
    console.error(
      error instanceof AppError && error.code === 'ADMIN_EXISTS'
        ? 'ADMIN_EXISTS: administrator not created; existing credentials were not changed'
        : 'SEED_FAILED: verify database connectivity and administrator/index permissions',
    );
    process.exitCode = 1;
  } finally {
    try {
      await db.disconnect();
    } catch {
      console.error('SEED_DISCONNECT_FAILED');
      process.exitCode = 1;
    }
  }
}

await main();
