import type { Types } from 'mongoose';
import type { CategoryRecord } from '../model/category.model.js';

export const CATEGORY_SLUG_PATTERN =
  /^[\p{L}\p{N}][\p{L}\p{N}\p{M}]*(?:-[\p{L}\p{N}][\p{L}\p{N}\p{M}]*)*$/u;

export function normalizeCategorySlug(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

export function categoryDto(category: CategoryRecord & { _id: Types.ObjectId }, admin = false) {
  const data = {
    id: category._id.toString(),
    name: { ar: category.name.ar, ...(category.name.en ? { en: category.name.en } : {}) },
    slug: category.slug,
    description: {
      ...(category.description?.ar ? { ar: category.description.ar } : {}),
      ...(category.description?.en ? { en: category.description.en } : {}),
    },
    image: category.image?.toString() ?? null,
    sortOrder: category.sortOrder,
  };
  return admin
    ? {
        ...data,
        isActive: category.isActive,
        createdAt: category.createdAt.toISOString(),
        updatedAt: category.updatedAt.toISOString(),
      }
    : data;
}

export function escapeCategorySearch(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isDuplicateCategory(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

export const INITIAL_CATEGORIES = [
  { slug: 'human-resources', name: { ar: 'الموارد البشرية', en: 'Human Resources' }, sortOrder: 0 },
  { slug: 'marketing', name: { ar: 'التسويق', en: 'Marketing' }, sortOrder: 1 },
  {
    slug: 'job-market-preparation',
    name: { ar: 'التأهيل لسوق العمل', en: 'Job Market Preparation' },
    sortOrder: 2,
  },
  { slug: 'programming', name: { ar: 'البرمجة', en: 'Programming' }, sortOrder: 3 },
  { slug: 'english', name: { ar: 'اللغة الإنجليزية', en: 'English' }, sortOrder: 4 },
] as const;
