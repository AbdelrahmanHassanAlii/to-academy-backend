import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import type MongoStore from 'connect-mongo';
import { Database } from '../../src/config/database.js';
import { createSessionStore } from '../../src/config/session.js';
import { createApp } from '../../src/app.js';
import { parseEnvironment } from '../../src/config/env.js';
import { createLogger } from '../../src/infrastructure/logging/logger.js';
import { requireCsrf } from '../../src/shared/middleware/csrf.js';
import { testEnvironment } from '../helpers.js';
import { startServer } from '../../src/server.js';

const uri = process.env.TEST_MONGODB_URI;
if (!uri)
  throw new Error(
    'TEST_MONGODB_URI is required; set a dedicated *_test database. Integration checks are not skipped.',
  );
const databaseName = new URL(uri).pathname.slice(1);
if (!/^to_academy_test(?:_[a-z0-9]+)?$/.test(databaseName)) {
  throw new Error(
    'Unsafe integration database name: expected to_academy_test or to_academy_test_<suffix>',
  );
}
const env = parseEnvironment({ ...testEnvironment, MONGODB_URI: uri });
const logger = createLogger('silent');
const db = new Database(logger);
let store: MongoStore;
const ownedSessionIds: string[] = [];

beforeAll(async () => {
  await db.connect(uri);
  store = await createSessionStore(db.connection);
});
afterAll(async () => {
  if (store) {
    // No dropDatabase/collection or broad cleanup; delete only sessions created by this test run.
    await (await store.collectionP).deleteMany({ _id: { $in: ownedSessionIds } });
  }
  await db.disconnect();
});

describe('real MongoDB foundation', () => {
  it('starts the runtime only after database/session readiness and shuts it down idempotently', async () => {
    const runtime = await startServer({ ...env, PORT: 0 }, logger);
    try {
      const address = runtime.server.address();
      if (!address || typeof address === 'string') throw new Error('Missing HTTP address');
      const base = `http://127.0.0.1:${address.port}/api/v1`;
      expect((await fetch(`${base}/health`)).status).toBe(200);
      expect((await fetch(`${base}/ready`)).status).toBe(200);
      await Promise.all([runtime.shutdown(), runtime.shutdown()]);
      expect(runtime.database.connection.readyState).toBe(0);
      await expect(fetch(`${base}/health`)).rejects.toThrow();
    } finally {
      await runtime.shutdown();
    }
  });
  it('pings actual MongoDB and returns health/readiness through the composed app', async () => {
    expect(await db.ping()).toBe(true);
    const app = createApp({ env, logger, store, isReady: () => db.ping() });
    expect((await request(app).get('/api/v1/health')).status).toBe(200);
    expect((await request(app).get('/api/v1/ready')).status).toBe(200);
    expect((await request(app).get('/api/v1/health')).headers['set-cookie']).toBeUndefined();
  });

  it('persists a session in Mongo, reuses it across app instances and verifies CSRF', async () => {
    const fixture = express.Router();
    fixture.post('/probe', requireCsrf(env), (_req, res) => {
      res.json({ accepted: true });
    });
    const app1 = createApp({ env, logger, store, isReady: () => db.ping() });
    const tokenRes = await request(app1)
      .get('/api/v1/auth/csrf')
      .set('Origin', 'http://localhost:5174');
    expect(tokenRes.status).toBe(200);
    const cookie = (tokenRes.headers['set-cookie'] as unknown as string[])[0]?.split(';')[0] ?? '';
    const token = tokenRes.body.data.csrfToken as string;
    const collection = await store.collectionP;
    const records = await collection.find({ 'session.csrfToken': token }).toArray();
    expect(records).toHaveLength(1);
    const record = records[0]!;
    ownedSessionIds.push(record._id);
    expect(record.expires!.getTime()).toBeGreaterThan(Date.now());
    expect((await collection.indexes()).some((index) => index.expireAfterSeconds === 0)).toBe(true);
    const app2 = createApp({
      env,
      logger,
      store,
      isReady: () => db.ping(),
      additionalRoutes: fixture,
    });
    expect(
      (
        await request(app2)
          .post('/api/v1/probe')
          .set('Origin', 'http://localhost:5174')
          .set('Cookie', cookie)
          .set('X-CSRF-Token', token)
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app2)
          .post('/api/v1/probe')
          .set('Origin', 'http://localhost:5174')
          .set('Cookie', cookie)
      ).status,
    ).toBe(403);
    await collection.updateOne(
      { _id: record._id },
      { $set: { 'session.expiresAt': Date.now() - 1 } },
    );
    const expired = await request(app2)
      .post('/api/v1/probe')
      .set('Origin', 'http://localhost:5174')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', token);
    expect(expired.status).toBe(401);
    expect(await collection.findOne({ _id: record._id })).toBeNull();
  });

  it('reports dependency loss without confusing it with liveness', async () => {
    const probeDb = new Database(logger);
    await probeDb.connect(uri);
    const app = createApp({ env, logger, isReady: () => probeDb.ping() });
    await probeDb.disconnect();
    expect(await probeDb.ping()).toBe(false);
    expect((await request(app).get('/api/v1/ready')).status).toBe(503);
    expect((await request(app).get('/api/v1/health')).status).toBe(200);
  });
});
