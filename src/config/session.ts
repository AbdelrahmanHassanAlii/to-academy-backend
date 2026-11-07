import session, { type SessionOptions } from 'express-session';
import MongoStore from 'connect-mongo';
import type { Connection } from 'mongoose';
import type { RequestHandler } from 'express';
import type { Environment } from './env.js';
import { AppError } from '../shared/errors/app-error.js';

export const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;

export function sessionOptions(env: Environment) {
  return {
    secret: env.SESSION_SECRET,
    name: env.SESSION_COOKIE_NAME,
    resave: false,
    saveUninitialized: false,
    rolling: false,
    cookie: {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_LIFETIME_MS,
    },
  } satisfies SessionOptions;
}

export async function createSessionStore(connection: Connection): Promise<MongoStore> {
  // Share the already-connected Mongoose client; shutdown has one connection owner.
  const store = MongoStore.create({
    client: connection.getClient(),
    dbName: connection.name,
    collectionName: 'sessions',
    ttl: SESSION_LIFETIME_MS / 1000,
    autoRemove: 'disabled',
    stringify: false,
  });
  const collection = await store.collectionP;
  // Await TTL setup before accepting traffic; MongoStore's native auto-index setup is asynchronous.
  await collection.createIndex({ expires: 1 }, { expireAfterSeconds: 0 });
  return store;
}

export function sessionMiddleware(env: Environment, store: session.Store): RequestHandler {
  const middleware = session({ ...sessionOptions(env), store });
  return (req, res, next) => {
    middleware(req, res, (error: unknown) => {
      next(
        error
          ? new AppError(503, 'SESSION_UNAVAILABLE', 'Session service is unavailable')
          : undefined,
      );
    });
  };
}
