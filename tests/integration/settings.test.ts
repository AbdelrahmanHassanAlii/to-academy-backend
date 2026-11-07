import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { Phase25Fixture } from '../fixtures/phase25.js';
import { expectOpenApiFields } from '../fixtures/openapi-fields.js';
import { SettingsService, createSettingsModel } from '../../src/modules/settings/index.js';
const f = new Phase25Fixture();
const model = createSettingsModel(f.db.connection);
const settings = new SettingsService(model);
const collection = f.db.connection.collection<{ _id: string }>('settings');
let previous: unknown;
beforeAll(async () => {
  await f.start({ settings });
  await settings.ensureIndexes();
  previous = await collection.findOne({ _id: 'academy' });
  await collection.deleteOne({ _id: 'academy' });
});
afterAll(async () => {
  try {
    if (f.db.connection.readyState === 1) {
      await collection.deleteOne({ _id: 'academy' });
      if (previous)
        await collection.insertOne(previous as Parameters<typeof collection.insertOne>[0]);
    }
  } finally {
    await f.stop();
  }
});
describe('academy settings singleton', () => {
  it('returns safe public defaults without creating a database record', async () => {
    const res = await request(f.app).get('/api/v1/settings').expect(200);
    expectOpenApiFields(res.body.data, 'AcademySettings');
    expect(res.body.data).toMatchObject({
      academyName: { ar: 'أكاديمية TO', en: 'TO Academy' },
      logo: null,
      contactPhone: null,
      whatsappNumber: null,
      contactEmail: null,
      socialLinks: {},
      defaultSeo: {},
    });
    expect(res.body.data).not.toHaveProperty('_id');
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(await model.countDocuments()).toBe(0);
  });
  it('atomically initializes one logical configuration under simultaneous updates', async () => {
    await Promise.all([
      settings.update({ contactEmail: 'hello@example.com' }),
      settings.update({ academyName: { ar: 'الأكاديمية' } }),
      settings.update({ contactPhone: '01000000000' }),
    ]);
    expect(await model.countDocuments()).toBe(1);
    const data = await settings.get();
    expect(data).toMatchObject({
      academyName: { ar: 'الأكاديمية' },
      contactEmail: 'hello@example.com',
      contactPhone: '+201000000000',
    });
    await expect(
      new model({ _id: 'other', academyName: { ar: 'bad' } }).validate(),
    ).rejects.toThrow();
  });
  it('updates approved public fields through admin API and filters database-only fields', async () => {
    const logo = await f.image();
    const res = await f
      .write('patch', '/api/v1/admin/settings')
      .send({
        logo,
        about: { ar: 'عن الأكاديمية' },
        whatsappNumber: '٠١٠٠٠٠٠٠٠٠٠',
        address: { ar: 'القاهرة' },
        footer: { ar: 'حقوق النشر' },
        socialLinks: { facebook: 'https://www.facebook.com/example' },
        defaultSeo: { title: { ar: 'أكاديمية' } },
      })
      .expect(200);
    expect(res.body.data).toMatchObject({
      logo,
      whatsappNumber: '+201000000000',
      about: { ar: 'عن الأكاديمية' },
    });
    await collection.updateOne(
      { _id: 'academy' },
      { $set: { privateSecret: 'should-never-appear' } },
    );
    const pub = await request(f.app).get('/api/v1/settings').expect(200);
    expect(JSON.stringify(pub.body)).not.toMatch(
      /should-never|privateSecret|__v|_id|createdAt|updatedAt/,
    );
    expect((await f.agent.get('/api/v1/admin/settings').expect(200)).body.data).toEqual(
      pub.body.data,
    );
    await expect(f.media.remove(logo)).rejects.toMatchObject({ code: 'MEDIA_REFERENCED' });
    await settings.update({ logo: null });
    await f.media.remove(logo);
  });
  it('validates URLs, contact details, unknown fields and public logo references', async () => {
    for (const body of [
      { socialLinks: { facebook: 'javascript:alert(1)' } },
      { socialLinks: { facebook: 'https://user:pass@example.com' } },
      { socialLinks: { facebook: '//example.com' } },
      { socialLinks: { unknown: 'https://example.com' } },
      { contactEmail: 'invalid' },
      { contactPhone: '123' },
      { whatsappNumber: 'hello' },
      { secret: 'no' },
      {},
      { logo: 'bad' },
    ]) {
      await f.write('patch', '/api/v1/admin/settings').send(body).expect(400);
    }
    await f
      .write('patch', '/api/v1/admin/settings')
      .send({ logo: new Types.ObjectId().toString() })
      .expect(409);
    await f
      .write('patch', '/api/v1/admin/settings')
      .send({ logo: await f.image('private') })
      .expect(409);
  });
  it('requires administrator authentication and CSRF', async () => {
    await request(f.app).get('/api/v1/admin/settings').expect(401);
    await request(f.app)
      .patch('/api/v1/admin/settings')
      .send({ contactEmail: 'a@example.com' })
      .expect(401);
    await f.agent
      .patch('/api/v1/admin/settings')
      .set('Origin', f.origin)
      .send({ contactEmail: 'a@example.com' })
      .expect(403);
    await f
      .write('patch', '/api/v1/admin/settings')
      .send({ contactPhone: null, whatsappNumber: null, contactEmail: null, socialLinks: {} })
      .expect(200);
  });
});
