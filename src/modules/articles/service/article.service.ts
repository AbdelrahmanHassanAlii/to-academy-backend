import { type Model, type Types, type SortOrder } from 'mongoose';
import type { ArticleRecord } from '../model/article.model.js';
import {
  createArticleSchema,
  updateArticleSchema,
  type CreateArticleInput,
  type UpdateArticleInput,
  type ArticleQuery,
} from '../validators/article.validator.js';
import { sanitizeArticleHtml, hasArticleText } from '../utils/article.utils.js';
import {
  generatedCourseSlug,
  isDuplicateCourse,
  escapeCourseSearch,
} from '../../courses/utils/index.js';
import { courseSlugValueSchema } from '../../courses/validators/index.js';
import { MediaReferences } from '../../../infrastructure/storage/media-references.js';
import { AppError } from '../../../shared/errors/app-error.js';
type Stored = ArticleRecord & { _id: Types.ObjectId };
const missing = () => new AppError(404, 'ARTICLE_NOT_FOUND', 'Article not found');
const conflict = () => new AppError(409, 'ARTICLE_SLUG_EXISTS', 'Article slug already exists');
const localized = (value: ArticleRecord['title'] | null) =>
  value ? { ar: value.ar, ...(value.en ? { en: value.en } : {}) } : null;
function content(value: ArticleRecord['content']) {
  return value
    ? {
        ar: sanitizeArticleHtml(value.ar),
        ...(value.en ? { en: sanitizeArticleHtml(value.en) } : {}),
      }
    : null;
}
function dto(row: Stored, admin = false, full = true) {
  return {
    id: row._id.toString(),
    title: localized(row.title),
    slug: row.slug,
    excerpt: localized(row.excerpt),
    thumbnail: row.thumbnail?.toString() ?? null,
    author: row.author,
    featured: row.featured,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    ...(full
      ? {
          content: content(row.content),
          seo: {
            ...(row.seo?.title ? { title: localized(row.seo?.title) } : {}),
            ...(row.seo?.description ? { description: localized(row.seo?.description) } : {}),
          },
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        }
      : {}),
    ...(admin ? { status: row.status } : {}),
  };
}
export class ArticleService {
  private readonly media: MediaReferences;
  constructor(private readonly model: Model<ArticleRecord>) {
    this.media = new MediaReferences(model.db);
  }
  async ensureIndexes() {
    await this.model.createIndexes();
  }
  private prepare(row: ArticleRecord) {
    if (row.content) row.content = content(row.content);
    if (
      row.status === 'published' &&
      (!row.excerpt?.ar || !row.content?.ar || !hasArticleText(row.content.ar))
    )
      throw new AppError(
        400,
        'ARTICLE_INCOMPLETE',
        'Publishing requires an excerpt and nonempty sanitized Arabic content',
      );
    if (row.status === 'published' && !row.publishedAt) row.publishedAt = new Date();
  }
  async create(raw: CreateArticleInput) {
    const input = createArticleSchema.parse(raw);
    const auto = input.slug === undefined;
    const base = courseSlugValueSchema.parse(
      input.slug ?? generatedCourseSlug(input.title.en ?? input.title.ar),
    );
    for (let attempt = 0; attempt < (auto ? 100 : 1); attempt++) {
      const suffix = attempt ? '-' + (attempt + 1) : '';
      const row = new this.model({
        ...input,
        slug: base.slice(0, 120 - suffix.length).replace(/-+$/g, '') + suffix,
      });
      this.prepare(row);
      try {
        await this.media.run(
          row.thumbnail?.toString(),
          row.status === 'published',
          async (session) => {
            await row.save({ session: session ?? null });
          },
        );
        return dto(row, true);
      } catch (error) {
        if (!isDuplicateCourse(error)) throw error;
        if (!auto) throw conflict();
      }
    }
    throw conflict();
  }
  async update(id: string, raw: UpdateArticleInput) {
    const input = updateArticleSchema.parse(raw);
    const row = await this.model.findById(id);
    if (!row) throw missing();
    if (input.slug !== undefined && input.slug !== row.slug && row.publishedAt)
      throw new AppError(
        409,
        'ARTICLE_SLUG_LOCKED',
        'Previously published article slugs cannot change',
      );
    for (const [key, value] of Object.entries(input)) if (value !== undefined) row.set(key, value);
    this.prepare(row);
    try {
      await this.media.run(
        row.thumbnail?.toString(),
        row.status === 'published',
        async (session) => {
          await row.save({ session: session ?? null });
        },
      );
    } catch (error) {
      if (isDuplicateCourse(error)) throw conflict();
      if (error instanceof Error && error.name === 'VersionError')
        throw new AppError(
          409,
          'ARTICLE_CHANGED',
          'Article changed concurrently; reload and retry',
        );
      throw error;
    }
    return dto(row, true);
  }
  async archive(id: string) {
    return this.update(id, { status: 'archived' });
  }
  async getById(id: string) {
    const row = await this.model.findById(id).lean();
    if (!row) throw missing();
    return dto(row, true);
  }
  async getPublicBySlug(slug: string) {
    const row = await this.model.findOne({ slug, status: 'published' }).lean();
    if (!row) throw missing();
    return dto(row);
  }
  async list(query: ArticleQuery, admin = false) {
    const filter: Record<string, unknown> = admin ? {} : { status: 'published' };
    if (admin && query.status) filter.status = query.status;
    if (query.featured !== undefined) filter.featured = query.featured;
    if (query.q) {
      const match = { $regex: escapeCourseSearch(query.q), $options: 'i' };
      filter.$or = [
        { 'title.ar': match },
        { 'title.en': match },
        { 'excerpt.ar': match },
        { 'excerpt.en': match },
      ];
    }
    const sort: Record<string, SortOrder> =
      query.sort === 'title'
        ? { 'title.ar': 1, _id: 1 }
        : query.sort === 'oldest'
          ? { createdAt: 1, _id: 1 }
          : { createdAt: -1, _id: -1 };
    const [rows, total] = await Promise.all([
      this.model
        .find(filter)
        .select(admin ? '' : '-content -seo -updatedAt')
        .sort(sort)
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      this.model.countDocuments(filter),
    ]);
    return {
      data: rows.map((row) => dto(row, admin, admin)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
}
