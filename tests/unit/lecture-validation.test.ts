import { describe, expect, it } from 'vitest';
import {
  createLectureSchema,
  updateLectureSchema,
} from '../../src/modules/lectures/validators/index.js';

describe('lecture input', () => {
  const base = {
    title: { ar: 'محاضرة' },
    scheduledAt: '2030-06-01T18:00:00+03:00',
    durationMinutes: 60,
  };
  it('accepts explicit offsets and localized content', () => {
    expect(createLectureSchema.parse(base).scheduledAt).toBe(base.scheduledAt);
  });
  it.each([
    { title: { en: 'English only' } },
    { scheduledAt: '2030-06-01T18:00:00' },
    { scheduledAt: '2030-02-30T18:00:00Z' },
    { durationMinutes: 0 },
    { durationMinutes: -1 },
    { durationMinutes: 0.5 },
    { capacity: 0 },
    { capacity: -1 },
    { registrationDeadline: 'bad' },
    { course: 'bad' },
    { meetingUrl: 'javascript:alert(1)' },
    { meetingUrl: 'https://user:pass@example.com' },
    { status: 'deleted' },
    { reservedSeats: 10 },
  ])('rejects invalid lecture values %#', (extra) => {
    expect(createLectureSchema.safeParse({ ...base, ...extra }).success).toBe(false);
  });
  it('rejects empty changes', () => expect(updateLectureSchema.safeParse({}).success).toBe(false));
});
