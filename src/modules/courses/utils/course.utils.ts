export const COURSE_STATUSES = ['draft', 'published', 'archived'] as const;
export const TRAINING_MODES = ['online-live', 'online-recorded', 'hybrid'] as const;
export const COURSE_SLUG_PATTERN =
  /^[\p{L}\p{N}][\p{L}\p{N}\p{M}]*(?:-[\p{L}\p{N}][\p{L}\p{N}\p{M}]*)*$/u;
export function normalizeCourseSlug(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}
export function generatedCourseSlug(value: string): string {
  return normalizeCourseSlug(value.replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, ' '))
    .slice(0, 120)
    .replace(/-+$/g, '');
}
export function escapeCourseSearch(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
export function isDuplicateCourse(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}
