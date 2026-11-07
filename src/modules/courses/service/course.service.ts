import { Types, type Model, type SortOrder, type ClientSession } from 'mongoose';
import type { CourseRecord } from '../model/index.js';
import type { CourseQuery, CreateCourseInput, UpdateCourseInput } from '../validators/index.js';
import {
  createCourseSchema,
  updateCourseSchema,
  courseSlugValueSchema,
} from '../validators/index.js';
import { generatedCourseSlug, escapeCourseSearch, isDuplicateCourse } from '../utils/index.js';
import type { CategoryService } from '../../categories/index.js';
import { AppError } from '../../../shared/errors/app-error.js';

type StoredCourse = CourseRecord & { _id: Types.ObjectId };
const missing = () => new AppError(404, 'COURSE_NOT_FOUND', 'Course not found');
const invalid = (message: string) => new AppError(400, 'VALIDATION_ERROR', message);
const conflict = () => new AppError(409, 'COURSE_SLUG_EXISTS', 'Course slug already exists');
const cardProjection =
  '_id title slug shortDescription category thumbnail duration price currency isFree featured';
const detailProjection = `${cardProjection} description curriculum lectureCount targetAudience trainingMode seo createdAt updatedAt`;
function text(value: CourseRecord['title'] | null) {
  return value ? { ar: value.ar, ...(value.en ? { en: value.en } : {}) } : null;
}
function card(course: StoredCourse) {
  return {
    id: course._id.toString(),
    title: text(course.title),
    slug: course.slug,
    shortDescription: text(course.shortDescription),
    category: course.category.toString(),
    thumbnail: course.thumbnail?.toString() ?? null,
    duration: course.duration,
    price: course.price,
    currency: course.currency,
    isFree: course.isFree,
    featured: course.featured,
  };
}
function detail(course: StoredCourse) {
  return {
    ...card(course),
    description: text(course.description),
    curriculum: course.curriculum.map((unit) => ({ title: unit.title, topics: [...unit.topics] })),
    lectureCount: course.lectureCount,
    targetAudience: [...course.targetAudience],
    trainingMode: course.trainingMode,
    seo: {
      ...(course.seo?.title ? { title: text(course.seo.title) } : {}),
      ...(course.seo?.description ? { description: text(course.seo.description) } : {}),
    },
    createdAt: course.createdAt.toISOString(),
    updatedAt: course.updatedAt.toISOString(),
  };
}
function adminDto(course: StoredCourse) {
  return {
    ...detail(course),
    status: course.status,
    publishedAt: course.publishedAt?.toISOString() ?? null,
  };
}
export class CourseService {
  constructor(
    private readonly model: Model<CourseRecord>,
    private readonly categories: CategoryService,
  ) {}
  async ensureIndexes(): Promise<void> {
    await this.model.createIndexes();
  }

  async lectureReference(id: string) {
    const course = await this.model.findById(id).select('_id').lean().exec();
    if (!course) throw missing();
    return course._id.toString();
  }

  async registrationTarget(id: string, session: ClientSession) {
    const course = await this.model
      .findById(id)
      .select('_id title status category')
      .session(session)
      .lean()
      .exec();
    if (!course) throw missing();
    const category = await this.categories.registrationReference(
      course.category.toString(),
      session,
    );
    if (course.status !== 'published' || !category)
      throw new AppError(409, 'TARGET_INELIGIBLE', 'Target is not accepting registrations');
    return { id: course._id.toString(), title: course.title };
  }

  async list(query: CourseQuery, admin = false, featuredOnly = false) {
    const references = admin
      ? []
      : await this.categories.activeCourseReferences(undefined, query.category);
    const byId = new Map(references.map((category) => [category.id, category]));
    const filter: Record<string, unknown> = {};
    if (admin) {
      if (query.status) filter.status = query.status;
      if (query.category) filter.category = new Types.ObjectId(query.category);
    } else {
      filter.status = 'published';
      filter.category = { $in: references.map((category) => new Types.ObjectId(category.id)) };
    }
    if (featuredOnly) filter.featured = true;
    else if (query.featured !== undefined) filter.featured = query.featured;
    if (query.q) {
      const match = { $regex: escapeCourseSearch(query.q), $options: 'i' };
      filter.$or = [{ 'title.ar': match }, { 'title.en': match }];
    }
    const sort: Record<string, SortOrder> =
      query.sort === 'title'
        ? { 'title.ar': 1, _id: 1 }
        : query.sort === 'oldest'
          ? { createdAt: 1, _id: 1 }
          : { createdAt: -1, _id: -1 };
    const [courses, total] = await Promise.all([
      this.model
        .find(filter)
        .select(admin ? detailProjection + ' status publishedAt' : cardProjection)
        .sort(sort)
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean()
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return {
      data: courses.map((course) =>
        admin
          ? adminDto(course)
          : { ...card(course), category: byId.get(course.category.toString())! },
      ),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
  async getPublicBySlug(slug: string) {
    const course = await this.model
      .findOne({ slug, status: 'published' })
      .select(detailProjection)
      .lean()
      .exec();
    if (!course) throw missing();
    const [category] = await this.categories.activeCourseReferences(course.category.toString());
    if (!category) throw missing();
    return { ...detail(course), category };
  }
  async getById(id: string) {
    const course = await this.model.findById(id).lean().exec();
    if (!course) throw missing();
    return adminDto(course);
  }
  private async validateState(course: CourseRecord) {
    const category = await this.categories.courseReference(course.category.toString());
    if (course.status === 'published' && !category.isActive)
      throw new AppError(409, 'CATEGORY_INACTIVE', 'Published courses require an active category');
    if (course.isFree ? course.price !== 0 : course.price !== null && course.price <= 0)
      throw invalid(
        'Free courses require price zero; paid courses require a positive price or null',
      );
    if (
      course.status === 'published' &&
      (!course.shortDescription?.ar ||
        !course.description?.ar ||
        !course.duration ||
        !course.trainingMode)
    )
      throw invalid('Publishing requires descriptions, duration and trainingMode');
  }
  async create(raw: CreateCourseInput) {
    const input = createCourseSchema.parse(raw);
    const auto = input.slug === undefined;
    const base = courseSlugValueSchema.safeParse(
      input.slug ?? generatedCourseSlug(input.title.en ?? input.title.ar),
    );
    if (!base.success) throw invalid('A valid non-reserved course slug is required');
    // Bounded deterministic suffix allocation; unique Mongo index resolves concurrent writers.
    for (let attempt = 0; attempt < (auto ? 100 : 1); attempt++) {
      const suffix = attempt ? `-${attempt + 1}` : '';
      const slug = base.data.slice(0, 120 - suffix.length).replace(/-+$/g, '') + suffix;
      const course = new this.model({
        ...input,
        slug,
        price: input.price === undefined ? (input.isFree ? 0 : null) : input.price,
      });
      await this.validateState(course);
      if (course.status === 'published') course.publishedAt = new Date();
      try {
        await course.save();
        return adminDto(course);
      } catch (error) {
        if (!isDuplicateCourse(error)) throw error;
        if (!auto) throw conflict();
      }
    }
    throw conflict();
  }
  async update(id: string, raw: UpdateCourseInput) {
    const input = updateCourseSchema.parse(raw);
    const course = await this.model.findById(id).exec();
    if (!course) throw missing();
    if (input.slug !== undefined && input.slug !== course.slug && course.publishedAt)
      throw new AppError(
        409,
        'COURSE_SLUG_LOCKED',
        'A previously published course slug cannot change',
      );
    // Strict parsed keys are the allowlist; save validates the merged state and optimistic version.
    for (const [key, value] of Object.entries(input))
      if (value !== undefined) course.set(key, value);
    if (input.isFree === true && input.price === undefined) course.price = 0;
    await this.validateState(course);
    if (course.status === 'published' && !course.publishedAt) course.publishedAt = new Date();
    try {
      await course.save();
      return adminDto(course);
    } catch (error) {
      if (isDuplicateCourse(error)) throw conflict();
      if (error instanceof Error && error.name === 'VersionError')
        throw new AppError(409, 'COURSE_CHANGED', 'Course changed concurrently; reload and retry');
      throw error;
    }
  }
  async archive(id: string) {
    // Archive must remain possible even after an externally removed/inactive category.
    const course = await this.model
      .findByIdAndUpdate(
        id,
        { $set: { status: 'archived' }, $inc: { __v: 1 } },
        { returnDocument: 'after', runValidators: true },
      )
      .lean()
      .exec();
    if (!course) throw missing();
    return adminDto(course);
  }
}
