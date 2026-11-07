import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Database } from '../../src/config/database.js';
import { createLogger } from '../../src/infrastructure/logging/logger.js';
import { createCategoryModel, CategoryService } from '../../src/modules/categories/index.js';

const baseUri = process.env.TEST_MONGODB_URI;
if (!baseUri || !/^to_academy_test(?:_[a-z0-9]+)?$/.test(new URL(baseUri).pathname.slice(1)))
  throw new Error('Dedicated TEST_MONGODB_URI required');
const seedUrl = new URL(baseUri);
seedUrl.pathname = `/to_academy_test_categories_${randomBytes(5).toString('hex')}`;
const uri = seedUrl.toString();
const db = new Database(createLogger('silent'));
const model = createCategoryModel(db.connection);
const categories = new CategoryService(model);
const run = promisify(execFile);
const expectedSlugs = [
  'english',
  'human-resources',
  'job-market-preparation',
  'marketing',
  'programming',
];

async function seed() {
  const command = process.env.npm_execpath
    ? [process.env.npm_execpath, 'run', 'seed:categories']
    : ['--import', 'tsx', 'scripts/seed-categories.ts'];
  return run(process.execPath, command, {
    env: { ...process.env, MONGODB_URI: uri },
    timeout: 10_000,
  });
}
beforeAll(async () => {
  await db.connect(uri);
});
afterAll(async () => {
  try {
    // This database name is random per run; remove only the five known seeded records, never drop a DB/collection.
    if (db.connection.readyState === 1) await model.deleteMany({ slug: { $in: expectedSlugs } });
  } finally {
    await db.disconnect();
  }
});

describe('category seed command', () => {
  it('creates exactly five initial bilingual categories through the actual CLI', async () => {
    const first = await seed();
    expect(first.stdout).toContain('Categories seeded: 5 created, 0 existing');
    const records = await model.find().sort({ slug: 1 }).lean();
    expect(records.map((item) => item.slug)).toEqual(expectedSlugs);
    const hr = records.find((item) => item.slug === 'human-resources');
    expect(hr?.name).toEqual({ ar: 'الموارد البشرية', en: 'Human Resources' });
    expect(records.every((item) => item.isActive)).toBe(true);
  });
  it('is idempotent and preserves every administrator customization and timestamps', async () => {
    await model.updateOne(
      { slug: 'marketing' },
      {
        $set: {
          name: { ar: 'تسويق مخصص', en: 'Custom marketing' },
          description: { ar: 'وصف مخصص' },
          sortOrder: 99,
          isActive: false,
          image: '0123456789abcdef01234567',
        },
      },
    );
    const before = await model.findOne({ slug: 'marketing' }).lean();
    const second = await seed();
    expect(second.stdout).toContain('Categories seeded: 0 created, 5 existing');
    expect(await model.countDocuments()).toBe(5);
    const after = await model.findOne({ slug: 'marketing' }).lean();
    expect(after).toEqual(before);
  });
  it('remains duplicate-safe under concurrent service seed calls', async () => {
    await model.deleteOne({ slug: 'english' });
    const results = await Promise.all([categories.seedInitial(), categories.seedInitial()]);
    expect(results.reduce((sum, result) => sum + result.created, 0)).toBe(1);
    expect(await model.countDocuments({ slug: 'english' })).toBe(1);
    expect(await model.countDocuments()).toBe(5);
  });
});
