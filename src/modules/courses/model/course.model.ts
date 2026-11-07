import { Schema, type Connection, type Model, type Types } from 'mongoose';
import {
  COURSE_STATUSES,
  TRAINING_MODES,
  COURSE_SLUG_PATTERN,
  normalizeCourseSlug,
} from '../utils/index.js';
export interface LocalizedCourseText {
  ar: string;
  en?: string;
}
export interface CourseRecord {
  title: LocalizedCourseText;
  slug: string;
  shortDescription: LocalizedCourseText | null;
  description: LocalizedCourseText | null;
  category: Types.ObjectId;
  thumbnail: Types.ObjectId | null;
  curriculum: { title: string; topics: string[] }[];
  lectureCount: number;
  duration: string | null;
  targetAudience: string[];
  trainingMode: (typeof TRAINING_MODES)[number] | null;
  price: number | null;
  currency: 'EGP';
  isFree: boolean;
  status: (typeof COURSE_STATUSES)[number];
  featured: boolean;
  seo: { title?: LocalizedCourseText; description?: LocalizedCourseText };
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export function createCourseModel(connection: Connection): Model<CourseRecord> {
  if (connection.models.Course) return connection.models.Course as Model<CourseRecord>;
  const localized = (max: number) =>
    new Schema(
      {
        ar: { type: String, required: true, trim: true, maxlength: max },
        en: { type: String, trim: true, maxlength: max },
      },
      { _id: false, strict: 'throw' },
    );
  const curriculum = new Schema(
    {
      title: { type: String, required: true, trim: true, maxlength: 200 },
      topics: { type: [{ type: String, required: true, maxlength: 500 }], default: [] },
    },
    { _id: false, strict: 'throw' },
  );
  const seo = new Schema(
    { title: localized(200), description: localized(600) },
    { _id: false, strict: 'throw' },
  );
  const schema = new Schema<CourseRecord>(
    {
      title: { type: localized(200), required: true },
      slug: {
        type: String,
        required: true,
        maxlength: 120,
        set: normalizeCourseSlug,
        match: COURSE_SLUG_PATTERN,
        validate: (value: string) => value !== 'featured',
      },
      shortDescription: { type: localized(600), default: null },
      description: { type: localized(30000), default: null },
      category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
      thumbnail: { type: Schema.Types.ObjectId, default: null },
      curriculum: { type: [curriculum], default: [] },
      lectureCount: { type: Number, default: 0, min: 0, max: 10000, validate: Number.isInteger },
      duration: { type: String, trim: true, maxlength: 120, default: null },
      targetAudience: { type: [{ type: String, maxlength: 300 }], default: [] },
      trainingMode: { type: String, enum: [...TRAINING_MODES, null], default: null },
      price: {
        type: Number,
        default: null,
        min: 0,
        max: Number.MAX_SAFE_INTEGER,
        validate: (value: number | null) => value === null || Number.isSafeInteger(value),
      },
      currency: { type: String, enum: ['EGP'], default: 'EGP' },
      isFree: { type: Boolean, default: false },
      status: { type: String, enum: COURSE_STATUSES, default: 'draft' },
      featured: { type: Boolean, default: false },
      seo: { type: seo, default: () => ({}) },
      publishedAt: { type: Date, default: null },
    },
    { timestamps: true, autoIndex: false, strict: 'throw', optimisticConcurrency: true },
  );
  schema.pre('validate', function () {
    if (this.isFree ? this.price !== 0 : this.price !== null && this.price <= 0)
      this.invalidate(
        'price',
        'Free courses require zero; paid courses require positive price or null',
      );
    if (
      this.status === 'published' &&
      (!this.shortDescription?.ar || !this.description?.ar || !this.duration || !this.trainingMode)
    )
      this.invalidate(
        'status',
        'Published courses require descriptions, duration and training mode',
      );
  });
  schema.index({ slug: 1 }, { unique: true });
  schema.index({ status: 1, createdAt: -1, _id: -1 });
  schema.index({ category: 1, status: 1, createdAt: -1, _id: -1 });
  schema.index({ status: 1, featured: 1, createdAt: -1, _id: -1 });
  schema.index({ createdAt: -1, _id: -1 });
  return connection.model<CourseRecord>('Course', schema);
}
