import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import type { Logger } from 'pino';
import { createApp } from './app.js';
import { parseEnvironment, type Environment } from './config/env.js';
import { Database } from './config/database.js';
import { createSessionStore } from './config/session.js';
import { createLogger } from './infrastructure/logging/logger.js';
import { closeHttpServer } from './shared/utils/shutdown.js';
import { AdminService, createAdminModel } from './modules/admins/index.js';

export async function startServer(env: Environment, logger: Logger) {
  const database = new Database(logger);
  try {
    await database.connect(env.MONGODB_URI);
    const store = await createSessionStore(database.connection);
    const admins = new AdminService(createAdminModel(database.connection));
    await admins.ensureIndexes();
    store.on('error', () => logger.error({ code: 'SESSION_STORE_ERROR' }, 'Session store failed'));
    let stopping = false;
    const isReady = async () => {
      if (stopping || !(await database.ping())) return false;
      try {
        // Verify store access as well as the database ping; do not serialize or expose the result.
        await (await store.collectionP).findOne({}, { projection: { _id: 1 }, timeoutMS: 2000 });
        return true;
      } catch {
        return false;
      }
    };
    if (!(await isReady())) throw new Error('SESSION_STORE_UNAVAILABLE');
    const app = createApp({ env, logger, store, admins, isReady });
    const server = createServer(app);
    server.requestTimeout = 30_000;
    server.headersTimeout = 15_000;
    server.keepAliveTimeout = 5_000;
    await new Promise<void>((resolveListen, reject) => {
      server.once('error', reject);
      server.listen(env.PORT, () => {
        server.off('error', reject);
        resolveListen();
      });
    });
    server.on('error', () => logger.error({ code: 'HTTP_SERVER_ERROR' }, 'HTTP server failed'));
    logger.info({ port: env.PORT }, 'Backend listening');
    let shutdownPromise: Promise<void> | undefined;
    const shutdown = () => {
      shutdownPromise ??= (async () => {
        stopping = true;
        logger.info('Shutdown started');
        try {
          await closeHttpServer(server);
        } finally {
          // MongoStore uses this same client and has no cleanup timer. Do not close it twice.
          await database.disconnect();
        }
        logger.info('Shutdown complete');
      })();
      return shutdownPromise;
    };
    return { server, database, shutdown };
  } catch (error) {
    await database.disconnect();
    throw error;
  }
}

async function main(): Promise<void> {
  const logger = createLogger();
  try {
    const env = parseEnvironment(process.env);
    const runtime = await startServer(env, logger);
    const stop = () => {
      // Hard cap also covers an unavailable driver during disconnect; no indefinite deployment hang.
      const deadline = setTimeout(() => {
        logger.fatal('Shutdown deadline exceeded');
        process.exit(1);
      }, 12_000);
      deadline.unref();
      void runtime
        .shutdown()
        .catch(() => {
          logger.error({ code: 'SHUTDOWN_FAILED' }, 'Shutdown failed');
          process.exitCode = 1;
        })
        .finally(() => {
          clearTimeout(deadline);
        });
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  } catch (error) {
    // Configuration errors contain field names only; infrastructure errors are safe classifications.
    const message =
      error instanceof Error && error.message.startsWith('Invalid environment configuration:')
        ? error.message
        : 'Startup failed: check MongoDB connectivity, session-store access and listen port';
    logger.fatal({ code: 'STARTUP_FAILED' }, message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
