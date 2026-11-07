import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type MongoStore from 'connect-mongo';
import { Database } from '../../src/config/database.js';
import { createLogger } from '../../src/infrastructure/logging/logger.js';
import { parseEnvironment } from '../../src/config/env.js';
import { createSessionStore } from '../../src/config/session.js';
import { createApp } from '../../src/app.js';
import { AdminService, createAdminModel } from '../../src/modules/admins/index.js';
import { CategoryService, createCategoryModel } from '../../src/modules/categories/index.js';
import { testEnvironment } from '../helpers.js';

const uri = process.env.TEST_MONGODB_URI;
if (!uri || !/^to_academy_test(?:_[a-z0-9]+)?$/.test(new URL(uri).pathname.slice(1)))
  throw new Error('Dedicated TEST_MONGODB_URI required');
const logger = createLogger('silent');
const db = new Database(logger);
const env = parseEnvironment({ ...testEnvironment, MONGODB_URI: uri });
const model = createCategoryModel(db.connection);
const categories = new CategoryService(model);
const adminModel = createAdminModel(db.connection);
const admins = new AdminService(adminModel);
const prefix = `category-test-${randomUUID()}`;
const email = `${randomUUID()}@example.com`;
const password = randomBytes(24).toString('base64url');
const ownedIds: string[] = [];
const ownedSessions = new Set<string>();
const origin = 'http://localhost:5174';
let store: MongoStore;
let app: ReturnType<typeof createApp>;
let agent: ReturnType<typeof request.agent>;
let token: string;
let firstId: string;
let inactiveId: string;
beforeAll(async () => {
  await db.connect(uri);
  store = await createSessionStore(db.connection);
  await admins.ensureIndexes();
  await categories.ensureIndexes();
  await admins.createInitialAdmin({ name: 'Category test admin', email, password });
  app = createApp({ env, logger, store, admins, categories, isReady: () => db.ping() });
  agent = request.agent(app);
  for (const phase of ['before', 'after']) {
    const res = await agent.get('/api/v1/auth/csrf').set('Origin', origin).expect(200);
    token = res.body.data.csrfToken as string;
    const record = await (await store.collectionP).findOne({ 'session.csrfToken': token });
    if (record) ownedSessions.add(record._id);
    if (phase === 'before')
      await agent
        .post('/api/v1/auth/login')
        .set('Origin', origin)
        .set('X-CSRF-Token', token)
        .send({ email, password })
        .expect(200);
  }
  for (const [suffix, sortOrder, isActive] of [
    ['late', 30, true],
    ['early', 10, true],
    ['hidden', 0, false],
  ] as const) {
    const created = await categories.create({
      name: { ar: 'تصنيف اختبار', en: 'Test category' },
      slug: `${prefix}-${suffix}`,
      sortOrder,
      isActive,
    });
    ownedIds.push(created.id);
    if (suffix === 'early') firstId = created.id;
    if (suffix === 'hidden') inactiveId = created.id;
  }
});
afterAll(async () => {
  try {
    if (store) await (await store.collectionP).deleteMany({ _id: { $in: [...ownedSessions] } });
    if (db.connection.readyState === 1) {
      await model.deleteMany({ _id: { $in: ownedIds } });
      await adminModel.deleteOne({ email });
    }
  } finally {
    await db.disconnect();
  }
});
const adminWrite = (method: 'post' | 'patch' | 'delete', path: string) =>
  agent[method](path).set('Origin', origin).set('X-CSRF-Token', token);

describe('category model and service', () => {
  it('stores localized names, ObjectId images, defaults and declared indexes', async () => {
    const created = await categories.create({
      name: { ar: 'افتراضي' },
      slug: `${prefix}-defaults`,
    });
    ownedIds.push(created.id);
    const stored = await model.findById(created.id);
    expect(stored?.isActive).toBe(true);
    expect(stored?.sortOrder).toBe(0);
    expect(stored?.image).toBeNull();
    expect(stored?.createdAt).toBeInstanceOf(Date);
    const indexes = await model.collection.indexes();
    expect(indexes.some((index) => index.key.slug === 1 && index.unique)).toBe(true);
    expect(indexes.some((index) => index.key.isActive === 1 && index.key.sortOrder === 1)).toBe(
      true,
    );
    await expect(
      model.create({ name: { ar: 'مكرر' }, slug: `${prefix}-DEFAULTS` }),
    ).rejects.toMatchObject({ code: 11000 });
    await categories.deactivate(created.id);
  });
  it('returns safe 409 conflicts for normalized slug collisions', async () => {
    await expect(
      categories.create({ name: { ar: 'مكرر' }, slug: `${prefix}-EARLY` }),
    ).rejects.toMatchObject({ status: 409, code: 'CATEGORY_SLUG_EXISTS' });
  });
});

describe('public category API', () => {
  it('returns only active categories in deterministic sort order with pagination metadata', async () => {
    const res = await request(app).get('/api/v1/categories').query({ q: prefix, limit: 1 });
    expect(res.status).toBe(200);
    expect(res.body.data[0].id).toBe(firstId);
    expect(res.body.meta).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 });
    expect(Object.keys(res.body.data[0]).sort()).toEqual([
      'description',
      'id',
      'image',
      'name',
      'slug',
      'sortOrder',
    ]);
    const second = await request(app)
      .get('/api/v1/categories')
      .query({ q: prefix, page: 2, limit: 1 });
    expect(second.body.data[0].slug).toBe(`${prefix}-late`);
  });
  it('retrieves by slug and hides inactive/unknown categories', async () => {
    expect((await request(app).get(`/api/v1/categories/${prefix}-early`)).body.data.name.ar).toBe(
      'تصنيف اختبار',
    );
    expect((await request(app).get(`/api/v1/categories/${prefix}-hidden`)).status).toBe(404);
    expect((await request(app).get(`/api/v1/categories/${prefix}-missing`)).status).toBe(404);
  });
  it('rejects invalid pagination and public inactive filters without Mongo operator injection', async () => {
    for (const query of [{ limit: 101 }, { page: 0 }, { isActive: 'false' }, { 'q[$ne]': '' }]) {
      expect((await request(app).get('/api/v1/categories').query(query)).status).toBe(400);
    }
    const literal = await request(app)
      .get('/api/v1/categories')
      .query({ q: `${prefix}.*` });
    expect(literal.body.data).toEqual([]);
  });
});

describe('protected category API', () => {
  it('requires authentication on every admin route and CSRF on writes', async () => {
    for (const method of ['get', 'post', 'patch', 'delete'] as const) {
      const path =
        method === 'get' || method === 'post'
          ? '/api/v1/admin/categories'
          : `/api/v1/admin/categories/${firstId}`;
      expect((await request(app)[method](path)).status).toBe(401);
    }
    expect((await request(app).get(`/api/v1/admin/categories/${firstId}`)).status).toBe(401);
    expect(
      (await agent.post('/api/v1/admin/categories').send({ name: { ar: 'اختبار' } })).status,
    ).toBe(403);
  });
  it('lists inactive categories with exact boolean filters and retrieves admin metadata', async () => {
    const res = await agent.get('/api/v1/admin/categories').query({ q: prefix, isActive: 'false' });
    expect(res.status).toBe(200);
    expect(res.body.data.some((item: { id: string }) => item.id === inactiveId)).toBe(true);
    const detail = await agent.get(`/api/v1/admin/categories/${inactiveId}`);
    expect(detail.body.data).toMatchObject({ id: inactiveId, isActive: false });
    expect(detail.body.data.createdAt).toBeTypeOf('string');
  });
  it('creates and edits localized categories, activates, deactivates and safely soft-deletes', async () => {
    const create = await adminWrite('post', '/api/v1/admin/categories').send({
      name: { ar: 'جديد', en: `${prefix} New` },
      description: { ar: 'وصف' },
      image: '0123456789abcdef01234567',
    });
    expect(create.status).toBe(201);
    const id = create.body.data.id as string;
    ownedIds.push(id);
    expect(create.body.data.slug).toBe(`${prefix}-new`);
    const update = await adminWrite('patch', `/api/v1/admin/categories/${id}`).send({
      name: { ar: 'معدل' },
      sortOrder: 5,
      image: null,
    });
    expect(update.status).toBe(200);
    expect(update.body.data).toMatchObject({
      id,
      name: { ar: 'معدل' },
      sortOrder: 5,
      image: null,
      description: { ar: 'وصف' },
    });
    await adminWrite('patch', `/api/v1/admin/categories/${id}`)
      .send({ isActive: false })
      .expect(200);
    expect((await request(app).get(`/api/v1/categories/${prefix}-new`)).status).toBe(404);
    await adminWrite('patch', `/api/v1/admin/categories/${id}`)
      .send({ isActive: true })
      .expect(200);
    expect((await request(app).get(`/api/v1/categories/${prefix}-new`)).status).toBe(200);
    const deleted = await adminWrite('delete', `/api/v1/admin/categories/${id}`);
    expect(deleted.status).toBe(200);
    expect(deleted.body.data.isActive).toBe(false);
    expect(await model.findById(id)).not.toBeNull();
    await adminWrite('delete', `/api/v1/admin/categories/${id}`).expect(200);
  });
  it('rejects duplicate slugs on both create and update without leaking driver errors', async () => {
    const create = await adminWrite('post', '/api/v1/admin/categories').send({
      name: { ar: 'مكرر' },
      slug: `${prefix}-early`,
    });
    expect(create.status).toBe(409);
    expect(create.body.code).toBe('CATEGORY_SLUG_EXISTS');
    const update = await adminWrite('patch', `/api/v1/admin/categories/${inactiveId}`).send({
      slug: `${prefix}-EARLY`,
    });
    expect(update.status).toBe(409);
  });
  it('validates params, bodies and filters; returns 404 for valid missing ids', async () => {
    expect((await agent.get('/api/v1/admin/categories/invalid-id')).status).toBe(400);
    expect(
      (await adminWrite('patch', '/api/v1/admin/categories/invalid-id').send({ isActive: true }))
        .status,
    ).toBe(400);
    expect((await adminWrite('patch', `/api/v1/admin/categories/${firstId}`).send({})).status).toBe(
      400,
    );
    expect(
      (
        await adminWrite('post', '/api/v1/admin/categories').send({
          name: { en: 'Missing Arabic' },
          unknown: true,
        })
      ).status,
    ).toBe(400);
    expect((await agent.get('/api/v1/admin/categories').query({ isActive: 'yes' })).status).toBe(
      400,
    );
    for (const method of ['get', 'patch', 'delete'] as const) {
      const req = agent[method]('/api/v1/admin/categories/0123456789abcdef01234567')
        .set('Origin', origin)
        .set('X-CSRF-Token', token);
      expect((await (method === 'patch' ? req.send({ isActive: false }) : req)).status).toBe(404);
    }
  });
});
