import { Database } from '../src/config/database.js';
import { createLogger } from '../src/infrastructure/logging/logger.js';

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI is required; use .env or set it in the environment');
const database = new Database(createLogger());
try {
  await database.connect(uri);
  if (!(await database.ping())) throw new Error('DATABASE_PING_FAILED');
  console.log('MongoDB connectivity: PASS (live ping succeeded)');
} catch (error) {
  const code = error instanceof Error ? error.message : 'DATABASE_CONNECTION_FAILED';
  console.error(`MongoDB connectivity: FAIL (${code}). See README MongoDB setup instructions.`);
  process.exitCode = 1;
} finally {
  await database.disconnect();
}
