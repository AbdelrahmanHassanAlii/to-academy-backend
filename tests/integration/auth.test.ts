import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import express from 'express';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type MongoStore from 'connect-mongo';
import { Database } from '../../src/config/database.js';
import { createSessionStore } from '../../src/config/session.js';
import { createLogger } from '../../src/infrastructure/logging/logger.js';
import { parseEnvironment } from '../../src/config/env.js';
import { createApp } from '../../src/app.js';
import { createAdminModel } from '../../src/modules/admins/model/admin.model.js';
import { AdminService } from '../../src/modules/admins/service/admin.service.js';
import { authenticate } from '../../src/shared/middleware/authenticate.js';
import { authorize } from '../../src/shared/middleware/authorize.js';
import { testEnvironment } from '../helpers.js';

const uri = process.env.TEST_MONGODB_URI;
if (!uri || !/^to_academy_test(?:_[a-z0-9]+)?$/.test(new URL(uri).pathname.slice(1))) {
  throw new Error('A dedicated TEST_MONGODB_URI is required');
}
const env = parseEnvironment({ ...testEnvironment, MONGODB_URI: uri });
const logger = createLogger('silent');
const db = new Database(logger);
const model = createAdminModel(db.connection);
const admins = new AdminService(model);
const email = `auth-${randomUUID()}@example.com`;
const inactiveEmail = `inactive-${randomUUID()}@example.com`;
const password = randomBytes(24).toString('base64url');
const ownedSessions = new Set<string>();
let adminId: string;
let store: MongoStore;
const origin = 'http://localhost:5174';
function makeApp() {
  return createApp({ env, logger, store, admins, isReady: () => db.ping() });
}

async function csrf(agent: ReturnType<typeof request.agent>) {
  const response = await agent.get('/api/v1/auth/csrf').set('Origin', origin).expect(200);
  const token = response.body.data.csrfToken as string;
  const record = await (await store.collectionP).findOne({ 'session.csrfToken': token });
  if (record) ownedSessions.add(record._id);
  return {
    token,
    cookie: (response.headers['set-cookie'] as unknown as string[] | undefined)?.[0]?.split(';')[0],
  };
}

async function signedIn(app = makeApp()) {
  const agent = request.agent(app);
  const initial = await csrf(agent);
  const login = await agent
    .post('/api/v1/auth/login')
    .set('Origin', origin)
    .set('X-CSRF-Token', initial.token)
    .send({ email, password })
    .expect(200);
  const fresh = await csrf(agent);
  return { agent, initial, fresh, login };
}

beforeAll(async () => {
  await db.connect(uri);
  store = await createSessionStore(db.connection);
  await admins.ensureIndexes();
  adminId = (await admins.createInitialAdmin({ name: 'Test administrator', email, password })).id;
  const inactive = await admins.createInitialAdmin({
    name: 'Inactive administrator',
    email: inactiveEmail,
    password,
  });
  await model.updateOne({ _id: inactive.id }, { $set: { isActive: false } });
});

afterEach(() => {
  // Synthetic app instances install their own express-session connection listeners on this test store.
  // No app survives its test; production creates one middleware/store pair at startup.
  store?.removeAllListeners('connect');
  store?.removeAllListeners('disconnect');
});

afterAll(async () => {
  try {
    if (store) await (await store.collectionP).deleteMany({ _id: { $in: [...ownedSessions] } });
    if (db.connection.readyState === 1)
      await model.deleteMany({ email: { $in: [email, inactiveEmail] } });
  } finally {
    await db.disconnect();
  }
});

describe('administrator model', () => {
  it('enforces normalized unique email and hides passwordHash in queries and JSON', async () => {
    const ordinary = await model.findById(adminId);
    expect(ordinary?.passwordHash).toBeUndefined();
    const credential = await model.findById(adminId).select('+passwordHash');
    expect(credential?.passwordHash).toMatch(/^\$2[ab]\$12\$/);
    expect(JSON.stringify(credential)).not.toContain('passwordHash');
    await expect(
      admins.createInitialAdmin({ name: 'Duplicate', email: email.toUpperCase(), password }),
    ).rejects.toMatchObject({ status: 409, code: 'ADMIN_EXISTS' });
  });
});

describe('authentication API with real MongoDB sessions', () => {
  it('authenticates valid credentials, regenerates session and rotates CSRF without leaking identity secrets', async () => {
    const { agent, initial, fresh, login } = await signedIn();
    expect(login.body.data).toMatchObject({ id: adminId, email, role: 'admin' });
    expect(login.body.data.lastLoginAt).toBeTypeOf('string');
    expect(Object.keys(login.body.data).sort()).toEqual([
      'email',
      'id',
      'lastLoginAt',
      'name',
      'role',
    ]);
    const newCookie = (login.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    expect(newCookie).not.toBe(initial.cookie);
    expect(fresh.token).not.toBe(initial.token);
    expect((await agent.get('/api/v1/auth/me')).body.data.id).toBe(adminId);
    expect(
      (await request(makeApp()).get('/api/v1/auth/me').set('Cookie', initial.cookie!)).status,
    ).toBe(401);
    const record = await (await store.collectionP).findOne({ 'session.csrfToken': fresh.token });
    expect(record?.session).toMatchObject({ adminId });
    expect(Object.keys(record!.session).sort()).toEqual([
      'adminId',
      'cookie',
      'csrfToken',
      'expiresAt',
    ]);
    const otherInstance = await request(makeApp()).get('/api/v1/auth/me').set('Cookie', newCookie);
    expect(otherInstance.status).toBe(200);
    expect(
      (
        await agent
          .post('/api/v1/auth/logout')
          .set('Origin', origin)
          .set('X-CSRF-Token', initial.token)
      ).status,
    ).toBe(403);
  });

  it.each(['wrong-password', 'unknown-email', 'inactive'] as const)(
    'rejects %s with the same safe error',
    async (kind) => {
      const agent = request.agent(makeApp());
      const { token } = await csrf(agent);
      const response = await agent
        .post('/api/v1/auth/login')
        .set('Origin', origin)
        .set('X-CSRF-Token', token)
        .send({
          email:
            kind === 'unknown-email'
              ? `unknown-${randomUUID()}@example.com`
              : kind === 'inactive'
                ? inactiveEmail
                : email,
          password: kind === 'wrong-password' ? randomBytes(24).toString('base64url') : password,
        });
      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        success: false,
        message: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS',
        errors: [],
      });
      expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
    },
  );

  it('validates login body and requires Origin plus CSRF before credentials', async () => {
    const agent = request.agent(makeApp());
    const { token } = await csrf(agent);
    expect(
      (
        await agent
          .post('/api/v1/auth/login')
          .set('Origin', origin)
          .set('X-CSRF-Token', token)
          .send({ email, password, role: 'admin' })
      ).status,
    ).toBe(400);
    expect(
      (await agent.post('/api/v1/auth/login').set('Origin', origin).send({ email, password }))
        .status,
    ).toBe(403);
    expect(
      (await agent.post('/api/v1/auth/login').set('X-CSRF-Token', token).send({ email, password }))
        .status,
    ).toBe(403);
  });

  it('blocks repeated failed logins and supplies Retry-After', async () => {
    const agent = request.agent(makeApp());
    const { token } = await csrf(agent);
    for (let attempt = 0; attempt < 5; attempt++) {
      await agent
        .post('/api/v1/auth/login')
        .set('Origin', origin)
        .set('X-CSRF-Token', token)
        .send({ email, password: randomBytes(24).toString('base64url') })
        .expect(401);
    }
    const limited = await agent
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('X-CSRF-Token', token)
      .send({ email, password });
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
  });

  it('logs out, deletes the persisted session, clears the cookie and rejects replay/repeated logout', async () => {
    const { agent, fresh, login } = await signedIn();
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    const response = await agent
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .set('X-CSRF-Token', fresh.token);
    expect(response.status).toBe(200);
    expect(response.body.data).toBeNull();
    expect(String(response.headers['set-cookie'])).toContain('Expires=Thu, 01 Jan 1970');
    expect(
      await (await store.collectionP).findOne({ 'session.csrfToken': fresh.token }),
    ).toBeNull();
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
    expect((await request(makeApp()).get('/api/v1/auth/me').set('Cookie', cookie)).status).toBe(
      401,
    );
    expect(
      (
        await agent
          .post('/api/v1/auth/logout')
          .set('Origin', origin)
          .set('X-CSRF-Token', fresh.token)
      ).status,
    ).toBe(401);
  });

  it('rejects missing and expired sessions and destroys invalid authenticated identities', async () => {
    expect((await request(makeApp()).get('/api/v1/auth/me')).status).toBe(401);
    const { agent, fresh } = await signedIn();
    const collection = await store.collectionP;
    await collection.updateOne(
      { 'session.csrfToken': fresh.token },
      { $set: { 'session.expiresAt': Date.now() - 1 } },
    );
    expect((await agent.get('/api/v1/auth/me')).body.code).toBe('SESSION_EXPIRED');
    expect(await collection.findOne({ 'session.csrfToken': fresh.token })).toBeNull();
    const another = await signedIn();
    await collection.updateOne(
      { 'session.csrfToken': another.fresh.token },
      { $set: { 'session.adminId': 'not-an-object-id' } },
    );
    expect((await another.agent.get('/api/v1/auth/me')).status).toBe(401);
    expect(await collection.findOne({ 'session.csrfToken': another.fresh.token })).toBeNull();
  });

  it('revokes existing sessions immediately when the administrator becomes inactive', async () => {
    const { agent, fresh } = await signedIn();
    try {
      await model.updateOne({ _id: adminId }, { $set: { isActive: false } });
      expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
      expect(
        await (await store.collectionP).findOne({ 'session.csrfToken': fresh.token }),
      ).toBeNull();
    } finally {
      await model.updateOne({ _id: adminId }, { $set: { isActive: true } });
    }
  });

  it('revokes sessions when the administrator is deleted', async () => {
    const deletedEmail = `deleted-${randomUUID()}@example.com`;
    const created = await admins.createInitialAdmin({
      name: 'Deleted test administrator',
      email: deletedEmail,
      password,
    });
    try {
      const agent = request.agent(makeApp());
      const initial = await csrf(agent);
      await agent
        .post('/api/v1/auth/login')
        .set('Origin', origin)
        .set('X-CSRF-Token', initial.token)
        .send({ email: deletedEmail.toUpperCase(), password })
        .expect(200);
      const fresh = await csrf(agent);
      await model.deleteOne({ _id: created.id });
      expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
      expect(
        await (await store.collectionP).findOne({ 'session.csrfToken': fresh.token }),
      ).toBeNull();
    } finally {
      await model.deleteOne({ _id: created.id });
    }
  });

  it('limits a normalized account across different client IPs', async () => {
    const app = createApp({
      env: { ...env, TRUST_PROXY_HOPS: 1 },
      logger,
      store,
      admins,
      isReady: () => db.ping(),
    });
    const agent = request.agent(app);
    const initial = await csrf(agent);
    for (let attempt = 0; attempt < 5; attempt++) {
      await agent
        .post('/api/v1/auth/login')
        .set('Origin', origin)
        .set('X-CSRF-Token', initial.token)
        .set('X-Forwarded-For', `192.0.2.${attempt + 1}`)
        .send({
          email: attempt % 2 ? email.toUpperCase() : email,
          password: randomBytes(24).toString('base64url'),
        })
        .expect(401);
    }
    const limited = await agent
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('X-CSRF-Token', initial.token)
      .set('X-Forwarded-For', '192.0.2.10')
      .send({ email, password });
    expect(limited.status).toBe(429);
  });

  it('protects profile routes and allows only a name update', async () => {
    expect((await request(makeApp()).get('/api/v1/admin/admins/me')).status).toBe(401);
    const { agent, fresh } = await signedIn();
    expect((await agent.get('/api/v1/admin/admins/me')).status).toBe(200);
    expect((await agent.patch('/api/v1/admin/admins/me').send({ name: 'Renamed' })).status).toBe(
      403,
    );
    const patch = () =>
      agent.patch('/api/v1/admin/admins/me').set('Origin', origin).set('X-CSRF-Token', fresh.token);
    expect((await patch().send({ name: 'Renamed', isActive: false })).status).toBe(400);
    expect((await patch().send({ name: 'Renamed' })).body.data.name).toBe('Renamed');
  });

  it('separates authentication from role authorization', async () => {
    const fixture = express.Router();
    fixture.get('/restricted', authenticate(admins, env), authorize(), (_req, res) => {
      res.sendStatus(200);
    });
    const app = createApp({
      env,
      logger,
      store,
      admins,
      isReady: () => db.ping(),
      additionalRoutes: fixture,
    });
    expect((await request(app).get('/api/v1/restricted')).status).toBe(401);
    const { agent } = await signedIn(app);
    expect((await agent.get('/api/v1/restricted')).status).toBe(403);
    expect((await agent.get('/api/v1/admin/admins/me')).status).toBe(200);
  });
});
