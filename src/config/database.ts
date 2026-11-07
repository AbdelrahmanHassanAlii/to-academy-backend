import mongoose, { type Connection } from 'mongoose';
import type { Logger } from 'pino';

export class Database {
  readonly connection: Connection;

  constructor(private readonly logger: Logger) {
    this.connection = mongoose.createConnection();
    this.connection.on('error', () =>
      logger.error({ code: 'DATABASE_ERROR' }, 'Database operation failed'),
    );
    this.connection.on('disconnected', () => logger.warn('Database disconnected'));
  }

  async connect(uri: string): Promise<void> {
    try {
      await this.connection.openUri(uri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
        socketTimeoutMS: 10000,
        maxPoolSize: 10,
        bufferCommands: false,
        autoIndex: false,
      });
      await this.connection.db!.command({ ping: 1 }, { timeoutMS: 2000 });
      this.logger.info('Database connected');
    } catch (error) {
      await this.disconnect();
      // Safe classification aids setup troubleshooting without leaking credentials/hostnames.
      const name = error instanceof Error ? error.name : 'UnknownError';
      const code =
        name === 'MongoServerSelectionError' || name === 'MongooseServerSelectionError'
          ? 'DATABASE_UNREACHABLE'
          : 'DATABASE_CONNECTION_FAILED';
      throw new Error(code, { cause: error });
    }
  }

  async ping(): Promise<boolean> {
    if (this.connection.readyState !== 1 || !this.connection.db) return false;
    try {
      await this.connection.db.command({ ping: 1 }, { timeoutMS: 2000 });
      return true;
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    await this.connection.close();
  }
}
