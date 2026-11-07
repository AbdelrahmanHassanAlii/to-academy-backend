import { Schema, type Connection, type Model, type Types } from 'mongoose';
import type { LocalizedCourseText } from '../../courses/model/index.js';
import { COURSE_SLUG_PATTERN, normalizeCourseSlug } from '../../courses/utils/index.js';
import { LECTURE_STATUSES } from '../utils/index.js';
export interface LectureRecord {
  title: LocalizedCourseText;
  slug: string;
  shortDescription: LocalizedCourseText | null;
  description: LocalizedCourseText | null;
  course: Types.ObjectId | null;
  scheduledAt: Date;
  durationMinutes: number;
  capacity: number | null;
  reservedSeats: number;
  registrationDeadline: Date | null;
  thumbnail: Types.ObjectId | null;
  meetingUrl: string | null;
  status: (typeof LECTURE_STATUSES)[number];
  seo: { title?: LocalizedCourseText; description?: LocalizedCourseText };
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export function createLectureModel(connection: Connection): Model<LectureRecord> {
  if (connection.models.Lecture) return connection.models.Lecture as Model<LectureRecord>;
  const localized = (max: number) =>
    new Schema(
      {
        ar: { type: String, required: true, trim: true, maxlength: max },
        en: { type: String, trim: true, maxlength: max },
      },
      { _id: false, strict: 'throw' },
    );
  const schema = new Schema<LectureRecord>(
    {
      title: { type: localized(200), required: true },
      slug: {
        type: String,
        required: true,
        maxlength: 120,
        set: normalizeCourseSlug,
        match: COURSE_SLUG_PATTERN,
      },
      shortDescription: { type: localized(600), default: null },
      description: { type: localized(30000), default: null },
      course: { type: Schema.Types.ObjectId, ref: 'Course', default: null },
      scheduledAt: { type: Date, required: true },
      durationMinutes: {
        type: Number,
        required: true,
        min: 1,
        max: 1440,
        validate: Number.isInteger,
      },
      capacity: {
        type: Number,
        min: 1,
        max: 100000,
        default: null,
        validate: (value: number | null) => value === null || Number.isInteger(value),
      },
      reservedSeats: { type: Number, default: 0, min: 0, validate: Number.isInteger },
      registrationDeadline: { type: Date, default: null },
      thumbnail: { type: Schema.Types.ObjectId, default: null },
      meetingUrl: { type: String, default: null, select: false, maxlength: 2000 },
      status: { type: String, enum: LECTURE_STATUSES, default: 'draft' },
      seo: {
        type: new Schema(
          { title: localized(200), description: localized(600) },
          { _id: false, strict: 'throw' },
        ),
        default: () => ({}),
      },
      publishedAt: { type: Date, default: null },
    },
    { timestamps: true, strict: 'throw', autoIndex: false, optimisticConcurrency: true },
  );
  schema.pre('validate', function () {
    if (this.registrationDeadline && this.registrationDeadline > this.scheduledAt)
      this.invalidate('registrationDeadline', 'Deadline must not follow schedule');
    if (this.capacity !== null && this.capacity < this.reservedSeats)
      this.invalidate('capacity', 'Capacity cannot be less than reserved seats');
    if (this.status === 'published' && (!this.shortDescription?.ar || !this.description?.ar))
      this.invalidate('status', 'Publication requires descriptions');
  });
  schema.index({ slug: 1 }, { unique: true });
  schema.index({ status: 1, scheduledAt: 1, _id: 1 });
  schema.index({ course: 1, status: 1, scheduledAt: 1, _id: 1 });
  schema.index({ createdAt: -1, _id: -1 });
  return connection.model<LectureRecord>('Lecture', schema);
}
