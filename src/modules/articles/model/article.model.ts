import { Schema, type Connection, type Model, type Types } from 'mongoose';
import type { LocalizedCourseText } from '../../courses/model/index.js';
import { ARTICLE_STATUSES } from '../utils/article.utils.js';
import { normalizeCourseSlug, COURSE_SLUG_PATTERN } from '../../courses/utils/index.js';
export interface ArticleRecord {
  title: LocalizedCourseText;
  slug: string;
  excerpt: LocalizedCourseText | null;
  content: LocalizedCourseText | null;
  thumbnail: Types.ObjectId | null;
  author: string;
  status: (typeof ARTICLE_STATUSES)[number];
  featured: boolean;
  seo: { title?: LocalizedCourseText; description?: LocalizedCourseText };
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export function createArticleModel(connection: Connection): Model<ArticleRecord> {
  if (connection.models.Article) return connection.models.Article as Model<ArticleRecord>;
  const localized = (max: number) =>
    new Schema(
      {
        ar: { type: String, required: true, maxlength: max },
        en: { type: String, maxlength: max },
      },
      { _id: false, strict: 'throw' },
    );
  const schema = new Schema<ArticleRecord>(
    {
      title: { type: localized(200), required: true },
      slug: {
        type: String,
        required: true,
        maxlength: 120,
        match: COURSE_SLUG_PATTERN,
        set: normalizeCourseSlug,
      },
      excerpt: { type: localized(600), default: null },
      content: { type: localized(30000), default: null },
      thumbnail: { type: Schema.Types.ObjectId, ref: 'Media', default: null },
      author: { type: String, default: 'فريق الأكاديمية', maxlength: 200 },
      status: { type: String, enum: ARTICLE_STATUSES, default: 'draft' },
      featured: { type: Boolean, default: false },
      seo: {
        type: new Schema(
          { title: localized(200), description: localized(600) },
          { _id: false, strict: 'throw' },
        ),
        default: () => ({}),
      },
      publishedAt: { type: Date, default: null },
    },
    { timestamps: true, autoIndex: false, strict: 'throw', optimisticConcurrency: true },
  );
  schema.index({ slug: 1 }, { unique: true });
  schema.index({ thumbnail: 1 });
  schema.index({ status: 1, featured: 1, createdAt: -1, _id: -1 });
  schema.index({ status: 1, createdAt: -1, _id: -1 });
  return connection.model<ArticleRecord>('Article', schema);
}
