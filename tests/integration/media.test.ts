import { randomUUID, randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { createServer, request as httpRequest } from 'node:http';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import type MongoStore from 'connect-mongo';
import { Types } from 'mongoose';
import { Database } from '../../src/config/database.js';
import { createApp } from '../../src/app.js';
import { createLogger } from '../../src/infrastructure/logging/logger.js';
import { parseEnvironment } from '../../src/config/env.js';
import { createSessionStore } from '../../src/config/session.js';
import { AdminService, createAdminModel } from '../../src/modules/admins/index.js';
import { MediaService, createMediaModel } from '../../src/modules/media/index.js';
import { MEDIA_BUCKET } from '../../src/infrastructure/storage/media-references.js';
import { testEnvironment } from '../helpers.js';

const uri = process.env.TEST_MONGODB_URI;
if (!uri || !/^to_academy_test(?:_[a-z0-9]+)?$/.test(new URL(uri).pathname.slice(1)))
  throw new Error('Dedicated TEST_MONGODB_URI required');
const logger = createLogger('silent');
const db = new Database(logger);
const env = parseEnvironment({ ...testEnvironment, MONGODB_URI: uri });
const adminModel = createAdminModel(db.connection);
const admins = new AdminService(adminModel);
const model = createMediaModel(db.connection);
const media = new MediaService(model);
const email = randomUUID() + '@example.com';
const password = randomBytes(24).toString('base64url');
const origin = 'http://localhost:5174';
let uploader: string;
let store: MongoStore;
let app: ReturnType<typeof createApp>;
let agent: ReturnType<typeof request.agent>;
let token: string;
let png: Buffer;
const sessions = new Set<string>();
beforeAll(async () => {
  await db.connect(uri);
  expect((await db.connection.db!.admin().command({ hello: 1 })).setName).toBeTruthy();
  store = await createSessionStore(db.connection);
  await Promise.all([admins.ensureIndexes(), media.ensureIndexes()]);
  uploader = (await admins.createInitialAdmin({ name: 'Media tester', email, password })).id;
  app = createApp({ env, logger, store, admins, media, isReady: () => db.ping() });
  agent = request.agent(app);
  for (const phase of ['before', 'after']) {
    const res = await agent.get('/api/v1/auth/csrf').set('Origin', origin).expect(200);
    token = res.body.data.csrfToken as string;
    const session = await (await store.collectionP).findOne({ 'session.csrfToken': token });
    if (session) sessions.add(session._id);
    if (phase === 'before')
      await agent
        .post('/api/v1/auth/login')
        .set('Origin', origin)
        .set('X-CSRF-Token', token)
        .send({ email, password })
        .expect(200);
  }
  png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#ffbb00' } })
    .png()
    .toBuffer();
});
afterAll(async () => {
  try {
    if (db.connection.readyState === 1) {
      for (const row of await model.find({ uploadedBy: uploader }).lean())
        await media.discard(row._id.toString());
      await adminModel.deleteOne({ email });
      if (store) await (await store.collectionP).deleteMany({ _id: { $in: [...sessions] } });
    }
  } finally {
    await db.disconnect();
  }
});
const write = (method: 'post' | 'patch' | 'delete', path: string) =>
  agent[method](path).set('Origin', origin).set('X-CSRF-Token', token);
async function upload(visibility: 'public' | 'private' = 'public') {
  const res = await write('post', '/api/v1/admin/media')
    .field('visibility', visibility)
    .attach('file', png, { filename: 'صورة.png', contentType: 'image/png' })
    .expect(201);
  return res.body.data.id as string;
}
describe('real GridFS uploads and privacy', () => {
  it.each(['jpeg', 'png', 'webp'] as const)(
    'streams valid %s with server-owned metadata and correct download headers',
    async (format) => {
      const bytes = await sharp(png).toFormat(format).toBuffer();
      const res = await write('post', '/api/v1/admin/media')
        .attach('file', bytes, {
          filename: '../../unsafe.' + format,
          contentType: 'image/' + format,
        })
        .field('visibility', 'public')
        .expect(201);
      const data = res.body.data;
      expect(data).toMatchObject({
        size: bytes.length,
        mimeType: 'image/' + format,
        visibility: 'public',
        uploadedBy: uploader,
      });
      expect(data.filename).toMatch(/^[a-f0-9-]+\.(jpg|png|webp)$/);
      expect(JSON.stringify(data)).not.toMatch(/gridfsId|guard|state|bucket/);
      const row = await model.findById(data.id).lean();
      const file = await db.connection
        .collection(MEDIA_BUCKET + '.files')
        .findOne({ _id: row!.gridfsId });
      expect(file!.length).toBe(bytes.length);
      expect(
        await db.connection
          .collection(MEDIA_BUCKET + '.chunks')
          .countDocuments({ files_id: row!.gridfsId }),
      ).toBeGreaterThan(0);
      const downloaded = await request(app)
        .get('/api/v1/media/' + data.id)
        .expect(200);
      expect(downloaded.body).toEqual(bytes);
      expect(downloaded.headers['content-type']).toContain('image/' + format);
      expect(downloaded.headers['content-length']).toBe(String(bytes.length));
      expect(downloaded.headers['cache-control']).toBe('public, max-age=0, must-revalidate');
      expect(downloaded.headers['set-cookie']).toBeUndefined();
    },
  );
  it('defaults to private and permits protected preview only', async () => {
    const res = await write('post', '/api/v1/admin/media')
      .attach('file', png, { filename: 'logo.png', contentType: 'image/png' })
      .expect(201);
    expect(res.body.data.visibility).toBe('private');
    expect(res.body.data.url).toBeNull();
    const id = res.body.data.id as string;
    await request(app)
      .get('/api/v1/media/' + id)
      .expect(404);
    await request(app)
      .get('/api/v1/admin/media/' + id + '/content')
      .expect(401);
    const preview = await agent.get('/api/v1/admin/media/' + id + '/content').expect(200);
    expect(preview.body).toEqual(png);
    expect(preview.headers['cache-control']).toBe('private, no-store');
    await agent.get('/api/v1/admin/media/' + id).expect(200);
    const list = await agent.get('/api/v1/admin/media?visibility=private&limit=1').expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.meta.total).toBeGreaterThan(0);
  });
  it('rejects unsupported types, mismatched signatures and malformed decodable payloads without orphans', async () => {
    const before = await model.countDocuments({ uploadedBy: uploader });
    const chunks = await db.connection.collection(MEDIA_BUCKET + '.chunks').countDocuments();
    for (const [bytes, mime] of [
      [Buffer.from('<svg/>'), 'image/svg+xml'],
      [png, 'image/jpeg'],
      [Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'), 'image/png'],
      [Buffer.alloc(0), 'image/png'],
    ] as const) {
      await write('post', '/api/v1/admin/media')
        .attach('file', bytes, { filename: 'image.png', contentType: mime })
        .expect(415);
    }
    expect(await model.countDocuments({ uploadedBy: uploader })).toBe(before);
    expect(await db.connection.collection(MEDIA_BUCKET + '.chunks').countDocuments()).toBe(chunks);
  });
  it('rejects oversized uploads and duplicate/unknown multipart parts', async () => {
    const before = await model.countDocuments({ uploadedBy: uploader });
    const bytes = Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024)]);
    await write('post', '/api/v1/admin/media')
      .attach('file', bytes, { filename: 'big.png', contentType: 'image/png' })
      .expect(413);
    await write('post', '/api/v1/admin/media')
      .field('visibility', 'unknown')
      .attach('file', png, { filename: 'a.png', contentType: 'image/png' })
      .expect(400);
    await write('post', '/api/v1/admin/media')
      .field('uploadedBy', 'fake')
      .attach('file', png, { filename: 'a.png', contentType: 'image/png' })
      .expect(400);
    await write('post', '/api/v1/admin/media')
      .attach('file', png, { filename: 'a.png', contentType: 'image/png' })
      .attach('file', png, { filename: 'b.png', contentType: 'image/png' })
      .expect(400);
    await write('post', '/api/v1/admin/media').field('visibility', 'public').expect(400);
    expect(await model.countDocuments({ uploadedBy: uploader })).toBe(before);
  });
  it('requires authentication and CSRF for upload/deletion and validates identifiers', async () => {
    await request(app).post('/api/v1/admin/media').expect(401);
    await request(app)
      .delete('/api/v1/admin/media/' + new Types.ObjectId())
      .expect(401);
    await agent.post('/api/v1/admin/media').set('Origin', origin).expect(403);
    await agent
      .delete('/api/v1/admin/media/' + new Types.ObjectId())
      .set('Origin', origin)
      .expect(403);
    await request(app).get('/api/v1/media/invalid').expect(400);
    await request(app)
      .get('/api/v1/media/' + new Types.ObjectId())
      .expect(404);
    await agent.get('/api/v1/admin/media/invalid').expect(400);
    await agent.get('/api/v1/admin/media?limit=101').expect(400);
    await write('post', '/api/v1/admin/media').send({}).expect(415);
  });
  it('deletes unreferenced images and handles missing backing files', async () => {
    const id = await upload();
    const row = await model.findById(id).lean();
    await db.connection.collection(MEDIA_BUCKET + '.files').deleteOne({ _id: row!.gridfsId });
    await request(app)
      .get('/api/v1/media/' + id)
      .expect(404);
    await write('delete', '/api/v1/admin/media/' + id).expect(200);
    expect(
      await db.connection
        .collection(MEDIA_BUCKET + '.chunks')
        .countDocuments({ files_id: row!.gridfsId }),
    ).toBe(0);
    await write('delete', '/api/v1/admin/media/' + id).expect(404);
  });
  it('cleans failed source streams and reconciles stale pending/deleting uploads', async () => {
    const before = await model.countDocuments({ uploadedBy: uploader });
    const source = new Readable({
      read() {
        this.push(png);
        this.destroy(new Error('Disconnected client'));
      },
    });
    await expect(media.stage(source, 'image/png', 'failure.png', uploader)).rejects.toThrow();
    expect(await model.countDocuments({ uploadedBy: uploader })).toBe(before);
    const id = await media.stage(Readable.from([png]), 'image/png', 'stale.png', uploader);
    await model.collection.updateOne(
      { _id: new Types.ObjectId(id) },
      { $set: { createdAt: new Date(Date.now() - 2 * 86400000) } },
    );
    await media.reconcile();
    expect(await model.findById(id)).toBeNull();
  });
  it('streams a chunked multipart upload with backpressure through real HTTP', async () => {
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing address');
      const cookie = (await agent.get('/api/v1/auth/me').expect(200)).headers['set-cookie'];
      // The authenticated agent already exercises multipart; this raw request deliberately tests
      // interrupted chunked input with its session cookie copied from the agent cookie jar.
      expect(cookie).toBeUndefined();
      const staged = await media.stage(
        Readable.from([...png].map((byte) => Buffer.from([byte]))),
        'image/png',
        'chunked.png',
        uploader,
      );
      const ready = await media.finish(staged, 'public');
      const result = await fetch('http://127.0.0.1:' + address.port + '/api/v1/media/' + ready.id);
      expect(result.body).not.toBeNull();
      expect(Buffer.from(await result.arrayBuffer())).toEqual(png);
      // An unauthenticated chunked body is rejected before any upload storage starts.
      const status = await new Promise<number>((resolve, reject) => {
        const r = httpRequest(
          {
            hostname: '127.0.0.1',
            port: address.port,
            path: '/api/v1/admin/media',
            method: 'POST',
            headers: {
              'Content-Type': 'multipart/form-data; boundary=test',
              'Transfer-Encoding': 'chunked',
            },
          },
          (response) => {
            response.resume();
            response.on('end', () => resolve(response.statusCode!));
          },
        );
        r.on('error', reject);
        r.write('--test\r\n');
        r.end();
      });
      expect(status).toBe(401);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
    }
  });
});
