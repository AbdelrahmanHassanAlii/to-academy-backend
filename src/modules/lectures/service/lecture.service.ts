import { Types, type Model, type SortOrder, type ClientSession } from 'mongoose';
import { MediaReferences } from '../../../infrastructure/storage/media-references.js';
import type { LectureRecord } from '../model/index.js';
import {
  createLectureSchema,
  updateLectureSchema,
  type CreateLectureInput,
  type UpdateLectureInput,
  type LectureQuery,
} from '../validators/index.js';
import { lectureTransitions } from '../utils/index.js';
import {
  generatedCourseSlug,
  escapeCourseSearch,
  isDuplicateCourse,
} from '../../courses/utils/index.js';
import type { CourseService } from '../../courses/index.js';
import { courseSlugValueSchema } from '../../courses/validators/index.js';
import { AppError } from '../../../shared/errors/app-error.js';

type StoredLecture = LectureRecord & { _id: Types.ObjectId };
const missing = () => new AppError(404, 'LECTURE_NOT_FOUND', 'Lecture not found');
const conflict = (message: string) => new AppError(409, 'LECTURE_CONFLICT', message);
const invalid = (message: string) => new AppError(400, 'VALIDATION_ERROR', message);
const cardProjection =
  '_id title slug shortDescription course scheduledAt durationMinutes capacity reservedSeats registrationDeadline thumbnail';
const detailProjection = `${cardProjection} description seo createdAt updatedAt`;
function card(row: StoredLecture) {
  return {
    id: row._id.toString(),
    title: row.title,
    slug: row.slug,
    shortDescription: row.shortDescription,
    course: row.course?.toString() ?? null,
    scheduledAt: row.scheduledAt.toISOString(),
    durationMinutes: row.durationMinutes,
    capacity: row.capacity,
    remainingSeats: row.capacity === null ? null : Math.max(0, row.capacity - row.reservedSeats),
    registrationDeadline: row.registrationDeadline?.toISOString() ?? null,
    thumbnail: row.thumbnail?.toString() ?? null,
  };
}
function detail(row: StoredLecture) {
  return {
    ...card(row),
    description: row.description,
    seo: row.seo,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
function adminDto(row: StoredLecture, includeMeeting = true) {
  return {
    ...detail(row),
    status: row.status,
    reservedSeats: row.reservedSeats,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    ...(includeMeeting ? { meetingUrl: row.meetingUrl ?? null } : {}),
  };
}
export class LectureService {
  constructor(
    private readonly model: Model<LectureRecord>,
    private readonly courses: CourseService,
  ) {}
  async ensureIndexes(): Promise<void> {
    await this.model.createIndexes();
  }
  async list(query: LectureQuery, admin = false) {
    const filter: Record<string, unknown> = admin ? {} : { status: 'published' };
    if (admin && query.status) filter.status = query.status;
    if (query.course) filter.course = new Types.ObjectId(query.course);
    if (query.period)
      filter.scheduledAt = query.period === 'upcoming' ? { $gt: new Date() } : { $lte: new Date() };
    if (query.q) {
      const match = { $regex: escapeCourseSearch(query.q), $options: 'i' };
      filter.$or = [{ 'title.ar': match }, { 'title.en': match }];
    }
    const sorts: Record<LectureQuery['sort'], Record<string, SortOrder>> = {
      schedule: { scheduledAt: 1, _id: 1 },
      latest: { scheduledAt: -1, _id: -1 },
      newest: { createdAt: -1, _id: -1 },
      oldest: { createdAt: 1, _id: 1 },
      title: { 'title.ar': 1, _id: 1 },
    };
    const [rows, total] = await Promise.all([
      this.model
        .find(filter)
        .select(admin ? `${detailProjection} status publishedAt` : cardProjection)
        .sort(sorts[query.sort])
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean()
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return {
      data: rows.map((row) => (admin ? adminDto(row, false) : card(row))),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
  async getPublicBySlug(slug: string) {
    const row = await this.model
      .findOne({ slug, status: 'published' })
      .select(detailProjection)
      .lean()
      .exec();
    if (!row) throw missing();
    return detail(row);
  }
  async getById(id: string) {
    const row = await this.model.findById(id).select('+meetingUrl').lean().exec();
    if (!row) throw missing();
    return adminDto(row);
  }
  private async validateState(row: LectureRecord, publishing: boolean) {
    if (row.course) await this.courses.lectureReference(row.course.toString());
    if (row.registrationDeadline && row.registrationDeadline > row.scheduledAt)
      throw invalid('Registration deadline must not follow the lecture schedule');
    if (row.capacity !== null && row.capacity < row.reservedSeats)
      throw conflict('Capacity cannot be less than reserved seats');
    if (row.status === 'published' && (!row.shortDescription?.ar || !row.description?.ar))
      throw invalid('Publishing requires short and full descriptions');
    if (publishing && row.scheduledAt.getTime() <= Date.now())
      throw invalid('Publishing requires a future schedule');
  }
  async create(raw: CreateLectureInput) {
    const input = createLectureSchema.parse(raw);
    if (input.status === 'completed' || input.status === 'cancelled')
      throw invalid('Create a draft or published lecture');
    const auto = input.slug === undefined;
    const parsedSlug = courseSlugValueSchema.safeParse(
      input.slug ?? generatedCourseSlug(input.title.en ?? input.title.ar),
    );
    if (!parsedSlug.success) throw invalid('A valid non-reserved lecture slug is required');
    const base = parsedSlug.data;
    for (let attempt = 0; attempt < (auto ? 100 : 1); attempt++) {
      const suffix = attempt ? `-${attempt + 1}` : '';
      const row = new this.model({
        ...input,
        slug: base.slice(0, 120 - suffix.length).replace(/-+$/g, '') + suffix,
      });
      await this.validateState(row, row.status === 'published');
      if (row.status === 'published') row.publishedAt = new Date();
      try {
        await new MediaReferences(this.model.db).run(
          row.thumbnail?.toString(),
          row.status === 'published',
          async (session) => {
            await row.save({ session: session ?? null });
          },
        );
        return adminDto(row);
      } catch (error) {
        if (!isDuplicateCourse(error)) throw error;
        if (!auto) throw new AppError(409, 'LECTURE_SLUG_EXISTS', 'Lecture slug already exists');
      }
    }
    throw new AppError(409, 'LECTURE_SLUG_EXISTS', 'Lecture slug already exists');
  }
  async update(id: string, raw: UpdateLectureInput, includeMeeting = true) {
    const input = updateLectureSchema.parse(raw);
    const row = await this.model.findById(id).select('+meetingUrl').exec();
    if (!row) throw missing();
    const oldStatus = row.status;
    if (input.slug !== undefined && input.slug !== row.slug && row.publishedAt)
      throw conflict('Previously published lecture slugs cannot change');
    if (
      input.status &&
      input.status !== oldStatus &&
      !lectureTransitions[oldStatus].includes(input.status)
    )
      throw conflict('Invalid lecture status transition');
    if (input.status === 'draft' && row.reservedSeats > 0)
      throw conflict('Lectures with reserved seats must be cancelled instead of unpublished');
    for (const [key, value] of Object.entries(input)) if (value !== undefined) row.set(key, value);
    await this.validateState(row, row.status === 'published' && oldStatus !== 'published');
    if (row.status === 'published' && !row.publishedAt) row.publishedAt = new Date();
    try {
      await new MediaReferences(this.model.db).run(
        row.thumbnail?.toString(),
        row.status === 'published',
        async (session) => {
          await row.save({ session: session ?? null });
        },
      );
      return adminDto(row, includeMeeting);
    } catch (error) {
      if (isDuplicateCourse(error))
        throw new AppError(409, 'LECTURE_SLUG_EXISTS', 'Lecture slug already exists');
      if (error instanceof Error && error.name === 'VersionError')
        throw conflict('Lecture changed concurrently; reload and retry');
      throw error;
    }
  }
  async cancel(id: string) {
    // Always retain lecture records, including drafts without registrations.
    return this.update(id, { status: 'cancelled' }, false);
  }
  async reserve(id: string, session: ClientSession) {
    const now = new Date();
    const row = await this.model
      .findOneAndUpdate(
        {
          _id: id,
          status: 'published',
          scheduledAt: { $gt: now },
          $and: [
            { $or: [{ registrationDeadline: null }, { registrationDeadline: { $gt: now } }] },
            { $or: [{ capacity: null }, { $expr: { $lt: ['$reservedSeats', '$capacity'] } }] },
          ],
        },
        { $inc: { reservedSeats: 1, __v: 1 } },
        { session, returnDocument: 'after' },
      )
      .select('_id title')
      .lean()
      .exec();
    if (!row) {
      const exists = await this.model.exists({ _id: id }).session(session);
      if (!exists) throw missing();
      throw new AppError(
        409,
        'TARGET_INELIGIBLE',
        'Lecture is full or not accepting registrations',
      );
    }
    return { id: row._id.toString(), title: row.title };
  }
  async release(id: string, session: ClientSession) {
    const result = await this.model.updateOne(
      { _id: id, reservedSeats: { $gt: 0 } },
      { $inc: { reservedSeats: -1, __v: 1 } },
      { session },
    );
    if (result.modifiedCount !== 1)
      throw conflict('Seat accounting requires administrative repair');
  }
  async assertAttendance(id: string, session: ClientSession) {
    const row = await this.model
      .findById(id)
      .select('status scheduledAt')
      .session(session)
      .lean()
      .exec();
    if (!row) throw missing();
    if (
      row.status === 'cancelled' ||
      (row.status !== 'completed' && row.scheduledAt.getTime() > Date.now())
    )
      throw conflict('Attendance requires a completed or started lecture');
  }
}
