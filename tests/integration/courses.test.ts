import { randomBytes, randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type MongoStore from 'connect-mongo';
import { Types } from 'mongoose';
import { Database } from '../../src/config/database.js';
import { createLogger } from '../../src/infrastructure/logging/logger.js';
import { parseEnvironment } from '../../src/config/env.js';
import { createSessionStore } from '../../src/config/session.js';
import { createApp } from '../../src/app.js';
import { AdminService, createAdminModel } from '../../src/modules/admins/index.js';
import { CategoryService, createCategoryModel } from '../../src/modules/categories/index.js';
import { CourseService } from '../../src/modules/courses/service/index.js';
import { createCourseModel } from '../../src/modules/courses/model/index.js';
import { testEnvironment } from '../helpers.js';

const uri = process.env.TEST_MONGODB_URI;
if (!uri || !/^to_academy_test(?:_[a-z0-9]+)?$/.test(new URL(uri).pathname.slice(1)))
  throw new Error('Dedicated TEST_MONGODB_URI required');
const logger = createLogger('silent');
const db = new Database(logger);
const env = parseEnvironment({ ...testEnvironment, MONGODB_URI: uri });
const categoryModel = createCategoryModel(db.connection);
const categories = new CategoryService(categoryModel);
const model = createCourseModel(db.connection);
const courses = new CourseService(model, categories);
const adminModel = createAdminModel(db.connection);
const admins = new AdminService(adminModel);
const prefix = `course-${randomUUID()}`;
const email = `${randomUUID()}@example.com`;
const password = randomBytes(24).toString('base64url');
const ownedSessions = new Set<string>();
const origin = 'http://localhost:5174';
let store: MongoStore;
let app: ReturnType<typeof createApp>;
let agent: ReturnType<typeof request.agent>;
let token: string;
let category: string;
let inactive: string;
const input = (suffix: string) => ({
  title: { ar: `برمجة ${prefix}`, en: prefix },
  slug: `${prefix}-${suffix}`,
  category,
  shortDescription: { ar: 'مقدمة' },
  description: { ar: 'شرح' },
  duration: '4 weeks',
  trainingMode: 'online-live' as const,
});
beforeAll(async () => {
  await db.connect(uri);
  store = await createSessionStore(db.connection);
  await Promise.all([admins.ensureIndexes(), categories.ensureIndexes(), courses.ensureIndexes()]);
  category = (await categories.create({ name: { ar: 'اختبار' }, slug: `${prefix}-active` })).id;
  inactive = (
    await categories.create({
      name: { ar: 'غير نشط' },
      slug: `${prefix}-inactive`,
      isActive: false,
    })
  ).id;
  await admins.createInitialAdmin({ name: 'Course tester', email, password });
  app = createApp({ env, logger, store, admins, categories, courses, isReady: () => db.ping() });
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
});
afterAll(async () => {
  try {
    if (db.connection.readyState === 1) {
      await model.deleteMany({ category: { $in: [category, inactive].filter(Boolean) } });
      await categoryModel.deleteMany({ _id: { $in: [category, inactive].filter(Boolean) } });
      await adminModel.deleteOne({ email });
      if (store) await (await store.collectionP).deleteMany({ _id: { $in: [...ownedSessions] } });
    }
  } finally {
    await db.disconnect();
  }
});
const write = (method: 'post' | 'patch' | 'delete', path: string) =>
  agent[method](path).set('Origin', origin).set('X-CSRF-Token', token);

describe('course model and service', () => {
  it('creates a draft with defaults and database indexes', async () => {
    const created = await courses.create({
      title: { ar: 'اختبار' },
      slug: `${prefix}-defaults`,
      category,
    });
    expect(created).toMatchObject({
      status: 'draft',
      price: null,
      currency: 'EGP',
      isFree: false,
      curriculum: [],
      lectureCount: 0,
      featured: false,
      publishedAt: null,
    });
    const indexes = await model.collection.indexes();
    expect(indexes.some((index) => index.key.slug === 1 && index.unique)).toBe(true);
    expect(indexes.some((index) => index.key.category === 1 && index.key.status === 1)).toBe(true);
    expect(indexes.some((index) => index.key.featured === 1 && index.key.status === 1)).toBe(true);
    await expect(
      model.create({ title: { ar: 'مكرر' }, slug: created.slug, category }),
    ).rejects.toMatchObject({ code: 11000 });
    await expect(new model({ ...input('negative'), price: -1 }).validate()).rejects.toThrow();
    await expect(
      new model({ ...input('free-invalid'), isFree: true, price: 20 }).validate(),
    ).rejects.toThrow();
  });
  it('generates unique Arabic slugs, preserves slugs on title edits, and handles explicit collisions', async () => {
    const title = { ar: `تعلم ${prefix}` };
    const a = await courses.create({ title, category });
    const b = await courses.create({ title, category });
    expect(a.slug).toContain('تعلم');
    expect(b.slug).toBe(`${a.slug}-2`);
    const changed = await courses.update(a.id, { title: { ar: 'عنوان جديد' } });
    expect(changed.slug).toBe(a.slug);
    await expect(courses.create({ ...input('collision'), slug: a.slug })).rejects.toMatchObject({
      status: 409,
    });
    await expect(courses.update(b.id, { slug: a.slug })).rejects.toMatchObject({ status: 409 });
    expect((await courses.update(b.id, { slug: `${prefix}-renamed` })).slug).toBe(
      `${prefix}-renamed`,
    );
  });
  it('enforces pricing and preserves unrelated fields during partial updates', async () => {
    const a = await courses.create({
      ...input('pricing'),
      price: 150000,
      curriculum: [{ title: 'Unit', topics: ['Topic'] }],
    });
    expect((await courses.update(a.id, { featured: true })).price).toBe(150000);
    const free = await courses.update(a.id, { isFree: true });
    expect(free.price).toBe(0);
    expect(free.curriculum).toEqual(a.curriculum);
    await expect(courses.update(a.id, { price: 100 })).rejects.toMatchObject({ status: 400 });
    await expect(courses.update(a.id, { isFree: false })).rejects.toMatchObject({ status: 400 });
    expect((await courses.update(a.id, { isFree: false, price: null })).price).toBeNull();
  });
  it('validates category existence, publication content and active category', async () => {
    await expect(
      courses.create({ ...input('missing'), category: new Types.ObjectId().toString() }),
    ).rejects.toMatchObject({ code: 'CATEGORY_NOT_FOUND' });
    await expect(
      courses.create({
        title: { ar: 'غير مكتمل' },
        slug: `${prefix}-incomplete`,
        category,
        status: 'published',
      }),
    ).rejects.toMatchObject({ status: 400 });
    const a = await courses.create({ ...input('inactive-draft'), category: inactive });
    await expect(courses.update(a.id, { status: 'published' })).rejects.toMatchObject({
      code: 'CATEGORY_INACTIVE',
    });
    await expect(
      courses.create({ ...input('inactive-published'), category: inactive, status: 'published' }),
    ).rejects.toMatchObject({ code: 'CATEGORY_INACTIVE' });
  });
  it('changes category assignments safely and exposes coherent free/paid pricing', async () => {
    const a = await courses.create({ ...input('assignment'), category: inactive });
    expect(
      (await courses.update(a.id, { category, status: 'published', isFree: true })).category,
    ).toBe(category);
    expect(await courses.getPublicBySlug(a.slug)).toMatchObject({
      isFree: true,
      price: 0,
      currency: 'EGP',
      category: { id: category },
    });
    await expect(courses.update(a.id, { category: inactive })).rejects.toMatchObject({
      code: 'CATEGORY_INACTIVE',
    });
    await expect(
      courses.update(a.id, { category: new Types.ObjectId().toString() }),
    ).rejects.toMatchObject({ code: 'CATEGORY_NOT_FOUND' });
    expect((await courses.getById(a.id)).category).toBe(category);
    await courses.update(a.id, { isFree: false, price: 75000 });
    expect(await courses.getPublicBySlug(a.slug)).toMatchObject({ isFree: false, price: 75000 });
    await expect(
      courses.create({ ...input('inconsistent-free'), isFree: true, price: null }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('course HTTP lifecycle', () => {
  it('requires admin authentication, CSRF and trusted origin for writes', async () => {
    await request(app).get('/api/v1/admin/courses').expect(401);
    await request(app).post('/api/v1/admin/courses').send(input('unauth')).expect(401);
    await agent.post('/api/v1/admin/courses').set('Origin', origin).send(input('csrf')).expect(403);
    await agent
      .post('/api/v1/admin/courses')
      .set('Origin', 'https://evil.example')
      .set('X-CSRF-Token', token)
      .send(input('origin'))
      .expect(403);
  });
  it('creates, publishes, locks SEO URL, unpublishes, republishes and archives', async () => {
    const created = await write('post', '/api/v1/admin/courses')
      .send(input('lifecycle'))
      .expect(201);
    const id = created.body.data.id as string;
    const path = `/api/v1/courses/${prefix}-lifecycle`;
    await request(app).get(path).expect(404);
    const published = await write('patch', `/api/v1/admin/courses/${id}`)
      .send({ status: 'published', featured: true })
      .expect(200);
    const firstPublishedAt = published.body.data.publishedAt;
    expect((await courses.getPublicBySlug(`${prefix}-lifecycle`)).slug).toBe(`${prefix}-lifecycle`);
    const publicResult = await request(app).get(path).expect(200);
    expect(publicResult.body).toMatchObject({
      success: true,
      meta: null,
      data: { price: null, category: { id: category }, lectureCount: 0 },
    });
    for (const key of ['status', 'publishedAt', '__v', '_id'])
      expect(publicResult.body.data).not.toHaveProperty(key);
    expect(publicResult.headers['set-cookie']).toBeUndefined();
    await write('patch', `/api/v1/admin/courses/${id}`)
      .send({ slug: `${prefix}-changed` })
      .expect(409);
    await write('patch', `/api/v1/admin/courses/${id}`).send({ status: 'draft' }).expect(200);
    await write('patch', `/api/v1/admin/courses/${id}`)
      .send({ slug: `${prefix}-changed` })
      .expect(409);
    await request(app).get(path).expect(404);
    const again = await write('patch', `/api/v1/admin/courses/${id}`)
      .send({ status: 'published' })
      .expect(200);
    expect(again.body.data.publishedAt).toBe(firstPublishedAt);
    await write('delete', `/api/v1/admin/courses/${id}`).expect(200);
    expect((await model.findById(id))?.status).toBe('archived');
    await request(app).get(path).expect(404);
  });
  it('filters published courses, searches titles literally, paginates, sorts and features', async () => {
    for (const suffix of ['search-a', 'search-b', 'search-draft', 'search-archived'])
      await courses.create({
        ...input(suffix),
        title: { ar: `بحث ${prefix}-${suffix}`, en: `${prefix}-${suffix}` },
        status: suffix.endsWith('draft')
          ? 'draft'
          : suffix.endsWith('archived')
            ? 'archived'
            : 'published',
        featured: suffix === 'search-a',
      });
    const first = await request(app)
      .get('/api/v1/courses')
      .query({ q: `${prefix}-search`, category: `${prefix}-active`, limit: 1, sort: 'oldest' })
      .expect(200);
    expect(first.body.meta).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 });
    expect(first.body.data[0].slug).toBe(`${prefix}-search-a`);
    expect(first.body.data[0]).not.toHaveProperty('description');
    const second = await request(app)
      .get('/api/v1/courses')
      .query({ q: `${prefix}-search`, page: 2, limit: 1, sort: 'oldest' })
      .expect(200);
    expect(second.body.data[0].slug).toBe(`${prefix}-search-b`);
    const newest = await request(app)
      .get('/api/v1/courses')
      .query({ q: `${prefix}-search`, sort: 'newest' })
      .expect(200);
    expect(newest.body.data.map((item: { slug: string }) => item.slug)).toEqual([
      `${prefix}-search-b`,
      `${prefix}-search-a`,
    ]);
    const featured = await request(app)
      .get('/api/v1/courses/featured')
      .query({ q: `${prefix}-search` })
      .expect(200);
    expect(featured.body.data.map((item: { slug: string }) => item.slug)).toEqual([
      `${prefix}-search-a`,
    ]);
    const plain = await request(app)
      .get('/api/v1/courses')
      .query({ q: `${prefix}-search`, featured: 'false', sort: 'title' })
      .expect(200);
    expect(plain.body.meta.total).toBe(1);
    const literal = await request(app)
      .get('/api/v1/courses')
      .query({ q: `${prefix}.*` })
      .expect(200);
    expect(literal.body.meta.total).toBe(0);
    const admin = await agent
      .get('/api/v1/admin/courses')
      .query({ q: `${prefix}-search`, status: 'draft' })
      .expect(200);
    expect(admin.body.meta.total).toBe(1);
    const byCategory = await agent
      .get('/api/v1/admin/courses')
      .query({ category: inactive })
      .expect(200);
    expect(
      byCategory.body.data.every((item: { category: string }) => item.category === inactive),
    ).toBe(true);
  });
  it('hides courses when categories deactivate or disappear and preserves archive capability', async () => {
    const temporary = await categories.create({
      name: { ar: 'مؤقت' },
      slug: `${prefix}-temporary`,
    });
    const a = await courses.create({
      ...input('relationship'),
      category: temporary.id,
      status: 'published',
    });
    try {
      await categories.deactivate(temporary.id);
      await request(app).get(`/api/v1/courses/${a.slug}`).expect(404);
      expect(
        (await request(app).get('/api/v1/courses').query({ category: temporary.slug })).body.meta
          .total,
      ).toBe(0);
      await categories.update(temporary.id, { isActive: true });
      await request(app).get(`/api/v1/courses/${a.slug}`).expect(200);
      await categoryModel.deleteOne({ _id: temporary.id });
      await request(app).get(`/api/v1/courses/${a.slug}`).expect(404);
      await expect(courses.update(a.id, { featured: true })).rejects.toMatchObject({
        code: 'CATEGORY_NOT_FOUND',
      });
      expect((await courses.archive(a.id)).status).toBe('archived');
    } finally {
      await model.deleteOne({ _id: a.id });
      await categoryModel.deleteOne({ _id: temporary.id });
    }
  });
  it('rejects malformed IDs, bodies, filters and duplicate slugs with consistent errors', async () => {
    await agent.get('/api/v1/admin/courses/bad').expect(400);
    await agent.get(`/api/v1/admin/courses/${new Types.ObjectId()}`).expect(404);
    await write('patch', `/api/v1/admin/courses/${new Types.ObjectId()}`)
      .send({ featured: true })
      .expect(404);
    await write('post', '/api/v1/admin/courses')
      .send({ ...input('negative-http'), price: -1 })
      .expect(400);
    await write('post', '/api/v1/admin/courses')
      .send({ ...input('unknown'), owner: 'injected' })
      .expect(400);
    const duplicate = await write('post', '/api/v1/admin/courses')
      .send(input('defaults'))
      .expect(409);
    expect(duplicate.body).toMatchObject({
      success: false,
      code: 'COURSE_SLUG_EXISTS',
      errors: [],
    });
    await request(app).get('/api/v1/courses').query({ status: 'draft' }).expect(400);
    await request(app).get('/api/v1/courses').query({ category: '$bad' }).expect(400);
    await agent.get('/api/v1/admin/courses').query({ category: 'bad' }).expect(400);
    await request(app).get(`/api/v1/courses/${prefix}-missing`).expect(404);
  });
});
