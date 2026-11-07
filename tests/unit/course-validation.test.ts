import { describe, expect, it } from 'vitest';
import {
  createCourseSchema,
  updateCourseSchema,
  publicCourseQuerySchema,
  courseIdSchema,
  courseSlugSchema,
} from '../../src/modules/courses/validators/index.js';

describe('course request validation', () => {
  const base = { title: { ar: 'دورة برمجة' }, category: '0123456789abcdef01234567' };
  it('accepts localized drafts and normalizes Arabic slugs', () => {
    expect(createCourseSchema.parse({ ...base, slug: ' دورة__برمجة ' }).slug).toBe('دورة-برمجة');
  });
  it.each([-1, 0.5, Infinity])('rejects invalid minor-unit prices %s', (price) => {
    expect(createCourseSchema.safeParse({ ...base, price }).success).toBe(false);
  });
  it.each([
    { category: 'bad' },
    { title: { en: 'English only' } },
    { curriculum: [{ title: 'Unit', topics: [42] }] },
    { trainingMode: 'offline' },
    { status: 'deleted' },
    { lectureCount: -1 },
    { unknown: true },
  ])('rejects malformed input %#', (extra) => {
    expect(createCourseSchema.safeParse({ ...base, ...extra }).success).toBe(false);
  });
  it('rejects empty patches, malformed IDs and reserved slugs', () => {
    expect(updateCourseSchema.safeParse({}).success).toBe(false);
    expect(courseIdSchema.safeParse({ id: 'bad' }).success).toBe(false);
    expect(courseSlugSchema.safeParse({ slug: 'featured' }).success).toBe(false);
    expect(courseSlugSchema.safeParse({ slug: '../admin' }).success).toBe(false);
  });
  it('validates pagination, boolean filters and sort allowlist', () => {
    expect(publicCourseQuerySchema.parse({ category: 'human-resources' }).category).toBe(
      'human-resources',
    );
    expect(publicCourseQuerySchema.parse({ featured: 'false', sort: 'oldest' })).toMatchObject({
      page: 1,
      limit: 12,
      featured: false,
      sort: 'oldest',
    });
    for (const query of [
      { limit: '101' },
      { page: '0' },
      { sort: '$where' },
      { featured: 'yes' },
      { status: 'draft' },
    ])
      expect(publicCourseQuerySchema.safeParse(query).success).toBe(false);
  });
});
