import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { Phase25Fixture } from '../fixtures/phase25.js';
const f = new Phase25Fixture();
let category: string;
const course = (
  suffix: string,
  thumbnail: string | null,
  status: 'draft' | 'published' = 'draft',
) => ({
  title: { ar: 'دورة' },
  slug: f.prefix + '-' + suffix,
  category,
  thumbnail,
  status,
  shortDescription: { ar: 'مقدمة' },
  description: { ar: 'شرح' },
  duration: '4 weeks',
  trainingMode: 'online-live' as const,
});
const lecture = (
  suffix: string,
  thumbnail: string | null,
  status: 'draft' | 'published' = 'draft',
) => ({
  title: { ar: 'محاضرة' },
  slug: f.prefix + '-' + suffix,
  thumbnail,
  status,
  scheduledAt: new Date(Date.now() + 86400000).toISOString(),
  durationMinutes: 60,
  shortDescription: { ar: 'مقدمة' },
  description: { ar: 'شرح' },
});
beforeAll(async () => {
  await f.start();
  category = (await f.categories.create({ name: { ar: 'فئة' }, slug: f.prefix })).id;
});
afterAll(() => f.stop());
describe('media references across courses and lectures', () => {
  it('rejects missing images and private images for published content', async () => {
    const missing = new Types.ObjectId().toString();
    await expect(f.courses.create(course('missing', missing))).rejects.toMatchObject({
      status: 409,
    });
    await expect(f.lectures.create(lecture('missing', missing))).rejects.toMatchObject({
      status: 409,
    });
    const privateId = await f.image('private');
    const c = await f.courses.create(course('private-course', privateId));
    const l = await f.lectures.create(lecture('private-lecture', privateId));
    await expect(f.courses.update(c.id, { status: 'published' })).rejects.toMatchObject({
      status: 409,
    });
    await expect(f.lectures.update(l.id, { status: 'published' })).rejects.toMatchObject({
      status: 409,
    });
    await expect(f.media.remove(privateId)).rejects.toMatchObject({ code: 'MEDIA_REFERENCED' });
  });
  it('requires real backing files even for draft references', async () => {
    const id = await f.image();
    await f.media.bucket.delete(new Types.ObjectId(id));
    await expect(f.courses.create(course('missing-binary', id))).rejects.toMatchObject({
      code: 'MEDIA_UNAVAILABLE',
    });
  });
  it('protects published, archived and cancelled references until explicitly replaced or removed', async () => {
    const shared = await f.image();
    const replacement = await f.image();
    const c = await f.courses.create(course('published-course', shared, 'published'));
    const l = await f.lectures.create(lecture('published-lecture', shared, 'published'));
    await expect(f.media.remove(shared)).rejects.toMatchObject({ code: 'MEDIA_REFERENCED' });
    await f.courses.archive(c.id);
    await f.lectures.cancel(l.id);
    await expect(f.media.remove(shared)).rejects.toMatchObject({ code: 'MEDIA_REFERENCED' });
    await f.courses.update(c.id, { thumbnail: replacement });
    await expect(f.media.remove(shared)).rejects.toMatchObject({ code: 'MEDIA_REFERENCED' });
    await f.lectures.update(l.id, { thumbnail: null });
    await f.media.remove(shared);
    expect((await f.courses.getById(c.id)).thumbnail).toBe(replacement);
  });
  it('serializes concurrent assignment/deletion across separate service instances', async () => {
    for (let i = 0; i < 8; i++) {
      const id = await f.image();
      const [assign, remove] = await Promise.allSettled([
        f.courses.create(course('race-' + i, id, 'published')),
        f.media.remove(id),
      ]);
      expect([assign.status, remove.status].filter((s) => s === 'fulfilled')).toHaveLength(1);
      if (assign.status === 'fulfilled') {
        expect(await f.mediaModel.findById(id)).not.toBeNull();
        expect((await f.courses.getById(assign.value.id)).thumbnail).toBe(id);
      } else {
        expect(remove.status).toBe('fulfilled');
        expect(await f.courseModel.findOne({ slug: f.prefix + '-race-' + i })).toBeNull();
      }
    }
  });
});
