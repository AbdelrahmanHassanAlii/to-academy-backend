import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { Phase25Fixture } from '../fixtures/phase25.js';
import { ArticleService, createArticleModel } from '../../src/modules/articles/index.js';
const f = new Phase25Fixture();
const model = createArticleModel(f.db.connection);
const articles = new ArticleService(model);
const input = (suffix: string) => ({
  title: { ar: 'مقال ' + f.prefix },
  slug: f.prefix + '-' + suffix,
  excerpt: { ar: 'مقدمة' },
  content: { ar: '<p>محتوى</p>' },
  author: 'فريق الأكاديمية',
});
beforeAll(async () => {
  await f.start({ articles });
  await articles.ensureIndexes();
});
afterAll(async () => {
  try {
    if (f.db.connection.readyState === 1)
      await model.deleteMany({ slug: { $regex: '^' + f.prefix } });
  } finally {
    await f.stop();
  }
});
describe('articles with real media references', () => {
  it('creates drafts, sanitizes content, publishes once, locks slugs and archives', async () => {
    const thumb = await f.image();
    const created = await f
      .write('post', '/api/v1/admin/articles')
      .send({
        ...input('lifecycle'),
        thumbnail: thumb,
        content: { ar: '<p onclick="x()">محتوى</p><script>x()</script>' },
      })
      .expect(201);
    const a = created.body.data;
    expect(a).toMatchObject({
      status: 'draft',
      publishedAt: null,
      content: { ar: '<p>محتوى</p>' },
    });
    await request(f.app)
      .get('/api/v1/articles/' + a.slug)
      .expect(404);
    const publish = await f
      .write('patch', '/api/v1/admin/articles/' + a.id)
      .send({ status: 'published' })
      .expect(200);
    expect(publish.body.data.publishedAt).toBeTruthy();
    const date = publish.body.data.publishedAt;
    const publicRes = await request(f.app)
      .get('/api/v1/articles/' + a.slug)
      .expect(200);
    expect(publicRes.body.data).not.toHaveProperty('status');
    expect(publicRes.headers['set-cookie']).toBeUndefined();
    await f
      .write('patch', '/api/v1/admin/articles/' + a.id)
      .send({ slug: f.prefix + '-new' })
      .expect(409);
    await f
      .write('patch', '/api/v1/admin/articles/' + a.id)
      .send({ title: { ar: 'عنوان جديد' } })
      .expect(200);
    expect((await articles.getById(a.id)).publishedAt).toBe(date);
    await f.write('delete', '/api/v1/admin/articles/' + a.id).expect(200);
    await request(f.app)
      .get('/api/v1/articles/' + a.slug)
      .expect(404);
    expect((await articles.getById(a.id)).status).toBe('archived');
    expect((await articles.update(a.id, { status: 'published' })).publishedAt).toBe(date);
  });
  it('enforces slug uniqueness, auto suffixes and publication requirements', async () => {
    const a = await articles.create(input('unique'));
    await expect(articles.create(input('unique'))).rejects.toMatchObject({ status: 409 });
    const first = await articles.create({ title: { ar: f.prefix + ' تلقائي' } });
    const second = await articles.create({ title: { ar: f.prefix + ' تلقائي' } });
    expect(second.slug).toBe(first.slug + '-2');
    await expect(
      articles.update(a.id, { content: { ar: '<script>bad()</script>' }, status: 'published' }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('validates missing/private media and protects referenced drafts as well as published images', async () => {
    const privateId = await f.image('private');
    const a = await articles.create({ ...input('private'), thumbnail: privateId });
    await expect(articles.update(a.id, { status: 'published' })).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      articles.create({ ...input('missing'), thumbnail: new Types.ObjectId().toString() }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(f.media.remove(privateId)).rejects.toMatchObject({ code: 'MEDIA_REFERENCED' });
    await articles.update(a.id, { thumbnail: null });
    await f.media.remove(privateId);
  });
  it('filters published/featured content, escapes search and paginates deterministically', async () => {
    for (let i = 0; i < 3; i++)
      await articles.create({
        ...input('search-' + i),
        title: { ar: f.prefix + ' بحث' },
        status: 'published',
        featured: i === 0,
      });
    await articles.create({
      ...input('hidden'),
      title: { ar: f.prefix + ' بحث' },
      status: 'draft',
    });
    const result = await request(f.app)
      .get('/api/v1/articles')
      .query({ q: f.prefix + ' بحث', limit: 2, sort: 'oldest' })
      .expect(200);
    expect(result.body.data).toHaveLength(2);
    expect(result.body.meta).toMatchObject({ total: 3, totalPages: 2 });
    expect(result.body.data[0]).not.toHaveProperty('content');
    const next = await request(f.app)
      .get('/api/v1/articles')
      .query({ q: f.prefix + ' بحث', limit: 2, page: 2, sort: 'oldest' })
      .expect(200);
    expect(next.body.data).toHaveLength(1);
    expect(next.body.data[0].id).not.toBe(result.body.data[0].id);
    expect(
      (
        await request(f.app)
          .get('/api/v1/articles')
          .query({ q: f.prefix + ' بحث', featured: true })
          .expect(200)
      ).body.data,
    ).toHaveLength(1);
    expect(
      (
        await request(f.app)
          .get('/api/v1/articles')
          .query({ q: '.*' + f.prefix })
          .expect(200)
      ).body.data,
    ).toHaveLength(0);
    await request(f.app).get('/api/v1/articles?status=draft').expect(400);
  });
  it('requires admin and CSRF and rejects unknown/server-owned fields', async () => {
    for (const method of ['get', 'post', 'patch', 'delete'] as const)
      await request(f.app)
        [method](
          '/api/v1/admin/articles' +
            (method === 'patch' || method === 'delete' ? '/' + new Types.ObjectId() : ''),
        )
        .expect(401);
    await f.agent
      .post('/api/v1/admin/articles')
      .set('Origin', f.origin)
      .send(input('csrf'))
      .expect(403);
    await f
      .write('post', '/api/v1/admin/articles')
      .send({ ...input('server'), publishedAt: new Date().toISOString() })
      .expect(400);
    await f.agent.get('/api/v1/admin/articles/bad').expect(400);
    await f.agent.get('/api/v1/admin/articles?status=draft').expect(200);
  });
});
