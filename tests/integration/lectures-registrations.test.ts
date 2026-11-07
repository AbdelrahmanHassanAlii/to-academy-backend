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
import { CourseService, createCourseModel } from '../../src/modules/courses/index.js';
import { LectureService, createLectureModel } from '../../src/modules/lectures/index.js';
import {
  RegistrationService,
  createRegistrationModel,
} from '../../src/modules/registrations/index.js';
import { testEnvironment } from '../helpers.js';

const uri = process.env.TEST_MONGODB_URI;
if (!uri || !/^to_academy_test(?:_[a-z0-9]+)?$/.test(new URL(uri).pathname.slice(1)))
  throw new Error('Dedicated TEST_MONGODB_URI required');
const logger = createLogger('silent');
const db = new Database(logger);
const env = parseEnvironment({ ...testEnvironment, MONGODB_URI: uri });
const categoryModel = createCategoryModel(db.connection);
const categories = new CategoryService(categoryModel);
const courseModel = createCourseModel(db.connection);
const courses = new CourseService(courseModel, categories);
const model = createLectureModel(db.connection);
const lectures = new LectureService(model, courses);
const registrationModel = createRegistrationModel(db.connection);
const registrations = new RegistrationService(registrationModel, lectures, courses);
const adminModel = createAdminModel(db.connection);
const admins = new AdminService(adminModel);
const prefix = `phase24-${randomUUID()}`;
const email = `${randomUUID()}@example.com`;
const password = randomBytes(24).toString('base64url');
const origin = 'http://localhost:5174';
const ownedSessions = new Set<string>();
let store: MongoStore;
let app: ReturnType<typeof createApp>;
let agent: ReturnType<typeof request.agent>;
let token: string;
let category: string;
let course: string;
const future = () => new Date(Date.now() + 7 * 86400000).toISOString();
const meetingUrl = 'https://meeting.example.com/private-owner-link';
const input = (suffix: string) => ({
  title: { ar: `محاضرة ${prefix}`, en: prefix },
  slug: `${prefix}-${suffix}`,
  shortDescription: { ar: 'وصف مختصر' },
  description: { ar: 'شرح كامل' },
  scheduledAt: future(),
  durationMinutes: 60,
  meetingUrl,
});
const createLecture = (suffix: string, extra = {}) =>
  lectures.create({ ...input(suffix), status: 'published', ...extra });
const registration = (
  targetId: string,
  phone = '01000000000',
  targetType: 'lecture' | 'course' = 'lecture',
) => ({ fullName: 'أحمد محمد', phone, targetType, targetId, privacyConsent: true as const });
const write = (method: 'post' | 'patch' | 'delete', path: string) =>
  agent[method](path).set('Origin', origin).set('X-CSRF-Token', token);
const submit = (targetId: string, phone?: string, targetType?: 'lecture' | 'course') =>
  request(app)
    .post('/api/v1/registrations')
    .set('Origin', origin)
    .send(registration(targetId, phone, targetType));

beforeAll(async () => {
  await db.connect(uri);
  await registrations.assertTransactionSupport();
  store = await createSessionStore(db.connection);
  await Promise.all([
    admins.ensureIndexes(),
    categories.ensureIndexes(),
    courses.ensureIndexes(),
    lectures.ensureIndexes(),
    registrations.ensureIndexes(),
  ]);
  category = (await categories.create({ name: { ar: 'اختبار' }, slug: prefix })).id;
  course = (
    await courses.create({
      title: { ar: 'دورة' },
      slug: prefix,
      category,
      shortDescription: { ar: 'مقدمة' },
      description: { ar: 'شرح' },
      duration: '4 weeks',
      trainingMode: 'online-live',
      status: 'published',
    })
  ).id;
  await admins.createInitialAdmin({ name: 'Registration tester', email, password });
  app = createApp({
    env,
    logger,
    store,
    admins,
    categories,
    courses,
    lectures,
    registrations,
    isReady: () => db.ping(),
  });
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
      const ids = (
        await model
          .find({ slug: { $regex: `^${prefix}` } })
          .select('_id')
          .lean()
      ).map((row) => row._id);
      await registrationModel.deleteMany({ $or: [{ lecture: { $in: ids } }, { course }] });
      await model.deleteMany({ _id: { $in: ids } });
      await courseModel.deleteMany({ category });
      await categoryModel.deleteOne({ _id: category });
      await adminModel.deleteOne({ email });
      if (store) await (await store.collectionP).deleteMany({ _id: { $in: [...ownedSessions] } });
    }
  } finally {
    await db.disconnect();
  }
});

describe('lecture lifecycle and public security', () => {
  it('rejects generated slugs that public routes cannot resolve', async () => {
    await expect(
      lectures.create({
        ...input('generated-reserved'),
        slug: undefined,
        title: { ar: 'محاضرة', en: 'Featured' },
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      lectures.create({ ...input('generated-empty'), slug: undefined, title: { ar: '!!!' } }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('omits the private URL from soft-cancellation responses', async () => {
    const lecture = await createLecture('cancel-private');
    const cancelled = await write('delete', `/api/v1/admin/lectures/${lecture.id}`).expect(200);
    expect(cancelled.body.data.status).toBe('cancelled');
    expect(cancelled.body.data).not.toHaveProperty('meetingUrl');
    expect(JSON.stringify(cancelled.body)).not.toContain(meetingUrl);
    expect((await agent.get(`/api/v1/admin/lectures/${lecture.id}`)).body.data.meetingUrl).toBe(
      meetingUrl,
    );
  });
  it('creates and edits a draft, publishes with a stable slug, completes and hides it', async () => {
    const created = await write('post', '/api/v1/admin/lectures')
      .send(input('lifecycle'))
      .expect(201);
    const id = created.body.data.id as string;
    await request(app).get(`/api/v1/lectures/${prefix}-lifecycle`).expect(404);
    await write('patch', `/api/v1/admin/lectures/${id}`)
      .send({ title: { ar: 'عنوان جديد' } })
      .expect(200);
    await write('patch', `/api/v1/admin/lectures/${id}`).send({ status: 'published' }).expect(200);
    await write('patch', `/api/v1/admin/lectures/${id}`).send({ slug: 'rename' }).expect(409);
    const detail = await request(app).get(`/api/v1/lectures/${prefix}-lifecycle`).expect(200);
    expect(detail.body.data.scheduledAt).toMatch(/Z$/);
    expect(JSON.stringify(detail.body)).not.toContain('meetingUrl');
    expect(JSON.stringify(detail.body)).not.toContain(meetingUrl);
    expect(detail.headers['set-cookie']).toBeUndefined();
    expect((await agent.get(`/api/v1/admin/lectures/${id}`).expect(200)).body.data.meetingUrl).toBe(
      meetingUrl,
    );
    await write('patch', `/api/v1/admin/lectures/${id}`).send({ status: 'completed' }).expect(200);
    await request(app).get(`/api/v1/lectures/${prefix}-lifecycle`).expect(404);
    await write('patch', `/api/v1/admin/lectures/${id}`).send({ status: 'published' }).expect(409);
  });
  it('rejects incomplete publication, invalid deadlines and missing related courses', async () => {
    await expect(
      lectures.create({
        title: { ar: 'بدون وصف' },
        scheduledAt: future(),
        durationMinutes: 60,
        status: 'published',
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      createLecture('deadline-bad', {
        registrationDeadline: new Date(Date.now() + 8 * 86400000).toISOString(),
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      createLecture('course-bad', { course: new Types.ObjectId().toString() }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      createLecture('past-publish', { scheduledAt: '2020-01-01T00:00:00Z' }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('searches literally, filters related course and upcoming/past, paginates and omits URLs', async () => {
    await createLecture('search-a', { course });
    await createLecture('search-b', { course });
    await lectures.create(input('search-draft'));
    const cancelled = await createLecture('search-cancelled', { course });
    await lectures.cancel(cancelled.id);
    const past = await createLecture('search-past', { course });
    await model.updateOne({ _id: past.id }, { $set: { scheduledAt: new Date('2020-01-01') } });
    const list = await request(app)
      .get('/api/v1/lectures')
      .query({ q: prefix, course, period: 'upcoming', limit: 1 })
      .expect(200);
    expect(list.body.meta).toMatchObject({ total: 2, totalPages: 2 });
    expect(JSON.stringify(list.body)).not.toContain('meetingUrl');
    expect(list.body.data[0]).not.toHaveProperty('description');
    const old = await request(app)
      .get('/api/v1/lectures')
      .query({ q: prefix, course, period: 'past' })
      .expect(200);
    expect(old.body.data.map((row: { id: string }) => row.id)).toEqual([past.id]);
    expect(
      (
        await request(app)
          .get('/api/v1/lectures')
          .query({ q: `${prefix}.*` })
      ).body.meta.total,
    ).toBe(0);
    const admin = await agent.get('/api/v1/admin/lectures').query({ q: prefix }).expect(200);
    expect(JSON.stringify(admin.body)).not.toContain('meetingUrl');
    await request(app).get('/api/v1/lectures').query({ status: 'draft' }).expect(400);
    await request(app).get('/api/v1/lectures').query({ limit: 101 }).expect(400);
  });
  it('requires admin authentication and CSRF for lecture writes', async () => {
    await request(app).get('/api/v1/admin/lectures').expect(401);
    await request(app).post('/api/v1/admin/lectures').send(input('forbidden')).expect(401);
    await agent
      .post('/api/v1/admin/lectures')
      .set('Origin', origin)
      .send(input('csrf'))
      .expect(403);
    await write('post', '/api/v1/admin/lectures')
      .set('Origin', 'https://evil.example')
      .send(input('origin'))
      .expect(403);
    await agent.get('/api/v1/admin/lectures/bad').expect(400);
    await agent.get(`/api/v1/admin/lectures/${new Types.ObjectId()}`).expect(404);
  });
});

describe('registration eligibility, privacy and duplicates', () => {
  it('registers without a session, stores consent and returns only a reference/status', async () => {
    const lecture = await createLecture('register');
    const result = await submit(lecture.id).expect(201);
    expect(result.body.data).toEqual({ reference: expect.any(String), status: 'pending' });
    expect(result.headers['set-cookie']).toBeUndefined();
    expect(JSON.stringify(result.body)).not.toContain(meetingUrl);
    const saved = await registrationModel.findOne({ lecture: lecture.id }).lean();
    expect(saved).toMatchObject({ phone: '+201000000000', email: null });
    expect(saved?.privacyConsentAt).toBeInstanceOf(Date);
    const detail = await agent.get(`/api/v1/admin/registrations/${saved!._id}`).expect(200);
    expect(detail.body.data.fullName).toBe('أحمد محمد');
    expect(detail.body.data).not.toHaveProperty('meetingUrl');
  });
  it('allows different targets and optional email for course enrollment without payments', async () => {
    await submit(course, undefined, 'course').expect(201);
    await expect(
      registrations.create(registration(course, '+20 100 000 0000', 'course')),
    ).rejects.toMatchObject({ code: 'REGISTRATION_EXISTS' });
    const lecture = await createLecture('other-target');
    await submit(lecture.id).expect(201);
  });
  it('rejects normalized duplicates at the database index and rolls back seats', async () => {
    const lecture = await createLecture('duplicate', { capacity: 3 });
    await submit(lecture.id).expect(201);
    const duplicate = await submit(lecture.id, '+20 100 000 0000').expect(409);
    expect(duplicate.body.code).toBe('REGISTRATION_EXISTS');
    expect(JSON.stringify(duplicate.body)).not.toContain('أحمد');
    expect((await model.findById(lecture.id))?.reservedSeats).toBe(1);
    const existing = await registrationModel.findOne({ lecture: lecture.id }).lean();
    await expect(
      registrationModel.create({ ...existing, _id: new Types.ObjectId() }),
    ).rejects.toMatchObject({ code: 11000 });
    expect(
      (await registrationModel.collection.indexes()).filter((index) => index.unique).length,
    ).toBeGreaterThanOrEqual(3);
  });
  it('validates exactly one matching model target', async () => {
    const lecture = await createLecture('model-target');
    const base = {
      fullName: 'Student',
      phone: '+201000000000',
      privacyConsentAt: new Date(),
      targetType: 'lecture',
      reference: randomUUID(),
      targetName: 'Target title',
    };
    await expect(
      new registrationModel({ ...base, lecture: lecture.id }).validate(),
    ).resolves.toBeUndefined();
    await expect(
      new registrationModel({ ...base, lecture: lecture.id, course }).validate(),
    ).rejects.toThrow();
    await expect(new registrationModel({ ...base, course }).validate()).rejects.toThrow();
    await expect(new registrationModel(base).validate()).rejects.toThrow();
  });
  it('rejects missing, draft and inactive-category course targets', async () => {
    await submit(new Types.ObjectId().toString()).expect(404);
    const draft = await lectures.create(input('registration-draft'));
    await submit(draft.id).expect(409);
    const draftCourse = await courses.create({
      title: { ar: 'مسودة' },
      category,
      slug: `${prefix}-draft-course`,
    });
    await submit(draftCourse.id, undefined, 'course').expect(409);
    await categories.deactivate(category);
    try {
      await submit(course, '01100000000', 'course').expect(409);
    } finally {
      await categories.update(category, { isActive: true });
    }
  });
  it.each(['cancelled', 'completed'] as const)('rejects %s lectures', async (status) => {
    const lecture = await createLecture(`registration-${status}`);
    await lectures.update(lecture.id, { status });
    await submit(lecture.id).expect(409);
  });
  it('rejects expired deadlines and past published lectures', async () => {
    const lecture = await createLecture('expired', {
      registrationDeadline: new Date(Date.now() - 10000).toISOString(),
    });
    await submit(lecture.id).expect(409);
    const past = await createLecture('registration-past');
    await model.updateOne({ _id: past.id }, { $set: { scheduledAt: new Date('2020-01-01') } });
    await submit(past.id).expect(409);
  });
  it('requires consent, trusted origin, JSON and strictly validated input', async () => {
    const lecture = await createLecture('input');
    await request(app).post('/api/v1/registrations').send(registration(lecture.id)).expect(403);
    await request(app)
      .post('/api/v1/registrations')
      .set('Origin', 'https://evil.example')
      .send(registration(lecture.id))
      .expect(403);
    await request(app)
      .post('/api/v1/registrations')
      .set('Origin', origin)
      .type('form')
      .send({ fullName: 'Name' })
      .expect(415);
    for (const extra of [
      { privacyConsent: false },
      { phone: 'bad' },
      { email: 'bad' },
      { targetId: 'bad' },
      { administrativeNotes: 'injected' },
    ])
      await request(app)
        .post('/api/v1/registrations')
        .set('Origin', origin)
        .send({ ...registration(lecture.id), ...extra })
        .expect(400);
  });
});

describe('atomic capacity and administrative lifecycle', () => {
  it('never overbooks under concurrent requests and cancelled seats are reusable', async () => {
    const lecture = await createLecture('concurrent', { capacity: 2 });
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        registrations
          .create(registration(lecture.id, `010000000${String(index).padStart(2, '0')}`))
          .then(
            (value) => ({ value }),
            (error: unknown) => ({ error }),
          ),
      ),
    );
    expect(results.filter((result) => 'value' in result)).toHaveLength(2);
    for (const result of results)
      if ('error' in result) expect(result.error).toMatchObject({ status: 409 });
    expect(await registrationModel.countDocuments({ lecture: lecture.id })).toBe(2);
    expect((await model.findById(lecture.id))?.reservedSeats).toBe(2);
    await submit(lecture.id, '01100000001').expect(409);
    const row = (await registrationModel.findOne({ lecture: lecture.id }))!;
    await registrations.update(row.id, { status: 'cancelled' });
    expect((await model.findById(lecture.id))?.reservedSeats).toBe(1);
    await registrations.create(registration(lecture.id, '01100000001'));
    await expect(registrations.update(row.id, { status: 'confirmed' })).rejects.toMatchObject({
      status: 409,
    });
    expect((await registrationModel.findById(row.id))?.status).toBe('cancelled');
    await expect(lectures.update(lecture.id, { capacity: 1 })).rejects.toMatchObject({
      status: 409,
    });
    await expect(lectures.update(lecture.id, { status: 'draft' })).rejects.toMatchObject({
      status: 409,
    });
    await lectures.cancel(lecture.id);
    expect((await model.findById(lecture.id))?.status).toBe('cancelled');
    expect(await registrationModel.countDocuments({ lecture: lecture.id })).toBe(3);
  });
  it('serializes capacity reductions with concurrent seat reservations', async () => {
    const lecture = await createLecture('capacity-race', { capacity: 2 });
    await Promise.allSettled([
      lectures.update(lecture.id, { capacity: 1 }),
      registrations.create(registration(lecture.id)),
      registrations.create(registration(lecture.id, '01100000000')),
    ]);
    const current = (await model.findById(lecture.id))!;
    expect(current.reservedSeats).toBeLessThanOrEqual(current.capacity!);
    expect(current.reservedSeats).toBe(
      await registrationModel.countDocuments({ lecture: lecture.id, status: { $ne: 'cancelled' } }),
    );
  });
  it('rolls back simultaneous duplicate attempts without consuming extra seats', async () => {
    const lecture = await createLecture('duplicate-race', { capacity: 10 });
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => registrations.create(registration(lecture.id))),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    for (const result of results)
      if (result.status === 'rejected')
        expect(result.reason).toMatchObject({ code: 'REGISTRATION_EXISTS' });
    expect((await model.findById(lecture.id))?.reservedSeats).toBe(1);
  });
  it('rolls back a reservation when registration persistence fails', async () => {
    const lecture = await createLecture('rollback', { capacity: 1 });
    // A server-side validator simulates an insert rejection after the seat update.
    await db.connection.db!.command({
      collMod: 'registrations',
      validator: { fullName: { $ne: 'Fail insertion' } },
      validationLevel: 'strict',
    });
    try {
      await expect(
        registrations.create({ ...registration(lecture.id), fullName: 'Fail insertion' }),
      ).rejects.toThrow();
    } finally {
      await db.connection.db!.command({ collMod: 'registrations', validator: {} });
    }
    expect((await model.findById(lecture.id))?.reservedSeats).toBe(0);
    await registrations.create(registration(lecture.id));
  });
  it('releases once on concurrent cancellation, reactivates once and validates transitions', async () => {
    const lecture = await createLecture('reactivate', { capacity: 1 });
    const created = await registrations.create(registration(lecture.id));
    const row = (await registrationModel.findOne({ reference: created.reference }))!;
    await expect(registrations.update(row.id, { status: 'attended' })).rejects.toMatchObject({
      status: 409,
    });
    await Promise.all([
      registrations.update(row.id, { status: 'cancelled' }),
      registrations.update(row.id, { status: 'cancelled' }),
    ]);
    expect((await model.findById(lecture.id))?.reservedSeats).toBe(0);
    await submit(lecture.id).expect(409);
    await Promise.all([
      registrations.update(row.id, { status: 'confirmed' }),
      registrations.update(row.id, { status: 'confirmed' }),
    ]);
    expect((await model.findById(lecture.id))?.reservedSeats).toBe(1);
    await expect(registrations.update(row.id, { status: 'attended' })).rejects.toMatchObject({
      status: 409,
    });
    await lectures.update(lecture.id, { status: 'completed' });
    await registrations.update(row.id, { status: 'attended' });
    await expect(registrations.update(row.id, { status: 'pending' })).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe('admin registration management and secure CSV', () => {
  it('rate limits public submissions before validation without creating sessions', async () => {
    const fixture = createApp({ env, logger, registrations, isReady: () => db.ping() });
    for (let attempt = 0; attempt < 30; attempt++)
      await request(fixture)
        .post('/api/v1/registrations')
        .set('Origin', origin)
        .send({})
        .expect(400);
    const limited = await request(fixture)
      .post('/api/v1/registrations')
      .set('Origin', origin)
      .send({})
      .expect(429);
    expect(limited.body.code).toBe('RATE_LIMITED');
    expect(limited.headers['retry-after']).toBeDefined();
    expect(limited.headers['set-cookie']).toBeUndefined();
  });
  it('rejects oversized exports before emitting CSV or partial contact data', async () => {
    const lecture = await createLecture('export-limit');
    await registrationModel.insertMany(
      Array.from({ length: 5001 }, (_, index) => ({
        fullName: 'Export fixture',
        phone: `+2010000${String(index).padStart(5, '0')}`,
        targetType: 'lecture',
        lecture: lecture.id,
        targetName: 'Export target',
        status: 'cancelled',
        privacyConsentAt: new Date(),
      })),
    );
    const result = await agent
      .get('/api/v1/admin/registrations/export')
      .query({ lecture: lecture.id })
      .expect(409);
    expect(result.body.code).toBe('EXPORT_TOO_LARGE');
    expect(result.headers['content-type']).toMatch(/application\/json/);
    expect(result.text).not.toContain('Export fixture');
  });
  it('protects every admin endpoint and CSRF writes', async () => {
    for (const path of [
      '/api/v1/admin/registrations',
      '/api/v1/admin/registrations/export',
      `/api/v1/admin/registrations/${new Types.ObjectId()}`,
    ])
      await request(app).get(path).expect(401);
    await request(app)
      .patch(`/api/v1/admin/registrations/${new Types.ObjectId()}`)
      .send({ status: 'cancelled' })
      .expect(401);
    await agent
      .patch(`/api/v1/admin/registrations/${new Types.ObjectId()}`)
      .send({ status: 'cancelled' })
      .expect(403);
    await write('patch', `/api/v1/admin/registrations/${new Types.ObjectId()}`)
      .send({ status: 'bogus' })
      .expect(400);
  });
  it('filters, paginates, hides unnecessary list PII and saves private notes', async () => {
    const lecture = await createLecture('admin');
    await registrations.create({ ...registration(lecture.id), email: 'student@example.com' });
    const list = await agent
      .get('/api/v1/admin/registrations')
      .query({ lecture: lecture.id, targetType: 'lecture', status: 'pending', q: 'أحمد', limit: 1 })
      .expect(200);
    expect(list.body.meta.total).toBe(1);
    const row = list.body.data[0];
    for (const key of ['phone', 'email', 'administrativeNotes', 'privacyConsentAt'])
      expect(row).not.toHaveProperty(key);
    const update = await write('patch', `/api/v1/admin/registrations/${row.id}`)
      .send({ status: 'confirmed', administrativeNotes: 'ملاحظة خاصة' })
      .expect(200);
    expect(update.body.data).toMatchObject({
      status: 'confirmed',
      administrativeNotes: 'ملاحظة خاصة',
      email: 'student@example.com',
    });
    expect(
      (
        await agent
          .get('/api/v1/admin/registrations')
          .query({ lecture: lecture.id, q: '+201000000000' })
      ).body.meta.total,
    ).toBe(1);
    await agent
      .get('/api/v1/admin/registrations')
      .query({ lecture: lecture.id, course })
      .expect(400);
    await agent.get('/api/v1/admin/registrations/bad').expect(400);
    await agent.get(`/api/v1/admin/registrations/${new Types.ObjectId()}`).expect(404);
  });
  it('exports filtered Arabic CSV with BOM, escaping and formula protection', async () => {
    const lecture = await createLecture('csv', { title: { ar: '=HYPERLINK("evil")' } });
    await registrations.create({
      ...registration(lecture.id),
      fullName: 'أحمد,"محمد"\nعلي',
      email: 'student@example.com',
    });
    const result = await agent
      .get('/api/v1/admin/registrations/export')
      .query({ lecture: lecture.id })
      .expect(200);
    expect(result.headers['content-type']).toMatch(/text\/csv; charset=utf-8/);
    expect(result.headers['content-disposition']).toContain('attachment');
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.text.charCodeAt(0)).toBe(0xfeff);
    expect(result.text).toContain('أحمد,""محمد""\nعلي');
    expect(result.text).toContain("'+201000000000");
    expect(result.text).toContain("'=HYPERLINK");
    expect(result.text).not.toContain(meetingUrl);
    expect(result.text).not.toContain('ملاحظة خاصة');
    const filtered = await agent
      .get('/api/v1/admin/registrations/export')
      .query({ lecture: lecture.id, status: 'cancelled' })
      .expect(200);
    expect(filtered.text.trim().split('\r\n')).toHaveLength(1);
  });
});
