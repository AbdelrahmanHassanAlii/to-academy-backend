import { describe, expect, it } from 'vitest';
import {
  createCategorySchema,
  updateCategorySchema,
  categoryIdSchema,
  categorySlugSchema,
  publicCategoryQuerySchema,
  adminCategoryQuerySchema,
} from '../../src/modules/categories/validators/index.js';
import { normalizeCategorySlug } from '../../src/modules/categories/utils/index.js';

describe('category validation and normalization', () => {
  it('accepts Arabic with optional English and normalizes an explicit slug', () => {
    const input = createCategorySchema.parse({
      name: { ar: ' الموارد البشرية ', en: ' Human Resources ' },
      slug: ' Human__Resources ',
    });
    expect(input.name).toEqual({ ar: 'الموارد البشرية', en: 'Human Resources' });
    expect(input.slug).toBe('human-resources');
    expect(normalizeCategorySlug(' تأهيل سوق العمل ')).toBe('تأهيل-سوق-العمل');
  });
  it('allows deriving a slug from the name in the service', () => {
    expect(createCategorySchema.parse({ name: { ar: 'البرمجة' } }).slug).toBeUndefined();
  });
  it.each([
    {},
    { name: 'flat name' },
    { name: { en: 'No Arabic' } },
    { name: { ar: '' } },
    { name: { ar: 'اختبار', fr: 'unknown' } },
    { name: { ar: 'اختبار' }, isActive: 'false' },
    { name: { ar: 'اختبار' }, sortOrder: 0.5 },
    { name: { ar: 'اختبار' }, sortOrder: -1 },
    { name: { ar: 'اختبار' }, image: 'https://untrusted.example/image' },
    { name: { ar: 'اختبار' }, unknown: true },
  ])('rejects invalid create input %#', (body) => {
    expect(createCategorySchema.safeParse(body).success).toBe(false);
  });
  it.each(['', '../private', 'a/b', 'a?b', '$where', 'a%2Fb', 'a\u0000b'])(
    'rejects unsafe slug %#',
    (slug) => {
      expect(categorySlugSchema.safeParse({ slug }).success).toBe(false);
    },
  );
  it('validates ObjectIds, rejects empty updates and permits deactivation/nullable image', () => {
    expect(categoryIdSchema.safeParse({ id: 'not-an-id' }).success).toBe(false);
    expect(categoryIdSchema.parse({ id: '0123456789abcdef01234567' }).id).toBe(
      '0123456789abcdef01234567',
    );
    expect(updateCategorySchema.safeParse({}).success).toBe(false);
    expect(updateCategorySchema.parse({ isActive: false, image: null })).toEqual({
      isActive: false,
      image: null,
    });
  });
  it('uses bounded pagination, strict boolean filters and rejects query operators/unknown keys', () => {
    expect(publicCategoryQuerySchema.parse({})).toEqual({ page: 1, limit: 12 });
    expect(adminCategoryQuerySchema.parse({ isActive: 'false', page: '2' })).toEqual({
      page: 2,
      limit: 20,
      isActive: false,
    });
    for (const query of [
      { page: '0' },
      { limit: '101' },
      { limit: '1.5' },
      { isActive: 'yes' },
      { q: { $ne: null } },
      { sort: '$where' },
    ]) {
      expect(adminCategoryQuerySchema.safeParse(query).success).toBe(false);
    }
    expect(publicCategoryQuerySchema.safeParse({ isActive: 'false' }).success).toBe(false);
  });
});
