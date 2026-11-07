import { Database } from '../src/config/database.js';
import { createLogger } from '../src/infrastructure/logging/logger.js';
import { createCategoryModel, CategoryService } from '../src/modules/categories/index.js';

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (process.argv.length > 2 || !uri || !/^mongodb(?:\+srv)?:\/\/[^\s]+$/.test(uri)) {
    console.error('CATEGORY_SEED_INPUT_INVALID: set MONGODB_URI privately; no arguments accepted');
    process.exitCode = 1;
    return;
  }
  const db = new Database(createLogger('silent'));
  try {
    await db.connect(uri);
    const service = new CategoryService(createCategoryModel(db.connection));
    await service.ensureIndexes();
    const result = await service.seedInitial();
    console.log(`Categories seeded: ${result.created} created, ${result.existing} existing`);
  } catch {
    console.error('CATEGORY_SEED_FAILED: verify database connectivity and index/write permissions');
    process.exitCode = 1;
  } finally {
    try {
      await db.disconnect();
    } catch {
      console.error('CATEGORY_SEED_DISCONNECT_FAILED');
      process.exitCode = 1;
    }
  }
}
await main();
