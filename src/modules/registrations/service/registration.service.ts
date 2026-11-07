import { Types, type ClientSession, type Model } from 'mongoose';
import type { RegistrationRecord } from '../model/index.js';
import {
  createRegistrationSchema,
  updateRegistrationSchema,
  type CreateRegistrationInput,
  type UpdateRegistrationInput,
  type RegistrationQuery,
} from '../validators/index.js';
import {
  csvCell,
  isDuplicateRegistration,
  registrationTransitions,
  normalizePhone,
} from '../utils/index.js';
import type { LectureService } from '../../lectures/index.js';
import type { CourseService } from '../../courses/index.js';
import { escapeCourseSearch } from '../../courses/utils/index.js';
import { AppError } from '../../../shared/errors/app-error.js';
type StoredRegistration = RegistrationRecord & { _id: Types.ObjectId };
const missing = () => new AppError(404, 'REGISTRATION_NOT_FOUND', 'Registration not found');
const duplicate = () =>
  new AppError(
    409,
    'REGISTRATION_EXISTS',
    'A registration already exists for this phone and target',
  );
const conflict = (message: string) => new AppError(409, 'REGISTRATION_CONFLICT', message);
const listProjection =
  '_id reference fullName targetType lecture course targetName status createdAt updatedAt';
function listDto(row: StoredRegistration) {
  return {
    id: row._id.toString(),
    reference: row.reference,
    fullName: row.fullName,
    targetType: row.targetType,
    lecture: row.lecture?.toString() ?? null,
    course: row.course?.toString() ?? null,
    targetName: row.targetName,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
function detailDto(row: StoredRegistration) {
  return {
    ...listDto(row),
    phone: row.phone,
    email: row.email,
    privacyConsentAt: row.privacyConsentAt.toISOString(),
    administrativeNotes: row.administrativeNotes,
  };
}
export class RegistrationService {
  constructor(
    private readonly model: Model<RegistrationRecord>,
    private readonly lectures: LectureService,
    private readonly courses: CourseService,
  ) {}
  async ensureIndexes(): Promise<void> {
    await this.model.createIndexes();
  }
  async assertTransactionSupport(): Promise<void> {
    const hello = await this.model.db.db!.admin().command({ hello: 1 });
    if (!hello.setName && hello.msg !== 'isdbgrid')
      throw new Error('REGISTRATIONS_REQUIRE_MONGODB_REPLICA_SET');
  }
  private async transaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    try {
      return await this.model.db.transaction(work, {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        maxCommitTimeMS: 5000,
      });
    } catch (error) {
      if (isDuplicateRegistration(error)) throw duplicate();
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 20)
        throw new AppError(
          503,
          'REGISTRATION_STORAGE_UNAVAILABLE',
          'Registration storage requires a MongoDB replica set',
        );
      throw error;
    }
  }
  async create(raw: CreateRegistrationInput) {
    const input = createRegistrationSchema.parse(raw);
    return this.transaction(async (session) => {
      const targetFilter = {
        [input.targetType]: new Types.ObjectId(input.targetId),
        phone: input.phone,
        targetType: input.targetType,
      };
      if (await this.model.exists(targetFilter).session(session)) throw duplicate();
      const target =
        input.targetType === 'lecture'
          ? await this.lectures.reserve(input.targetId, session)
          : await this.courses.registrationTarget(input.targetId, session);
      const [row] = await this.model.create(
        [
          {
            fullName: input.fullName,
            phone: input.phone,
            email: input.email ?? null,
            targetType: input.targetType,
            [input.targetType]: input.targetId,
            targetName: target.title.ar,
            privacyConsentAt: new Date(),
            status: 'pending',
          },
        ],
        { session },
      );
      return { reference: row!.reference, status: row!.status };
    });
  }
  private filter(query: RegistrationQuery) {
    const filter: Record<string, unknown> = {};
    if (query.targetType) filter.targetType = query.targetType;
    if (query.lecture) filter.lecture = new Types.ObjectId(query.lecture);
    if (query.course) filter.course = new Types.ObjectId(query.course);
    if (query.status) filter.status = query.status;
    if (query.q) {
      const phone = normalizePhone(query.q);
      const match = { $regex: escapeCourseSearch(query.q), $options: 'i' };
      filter.$or = [{ fullName: match }, { phone: phone ?? match }];
    }
    return filter;
  }
  async list(query: RegistrationQuery) {
    const filter = this.filter(query);
    const direction = query.sort === 'oldest' ? 1 : -1;
    const [rows, total] = await Promise.all([
      this.model
        .find(filter)
        .select(listProjection)
        .sort({ createdAt: direction, _id: direction })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean()
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return {
      data: rows.map(listDto),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
  async getById(id: string) {
    const row = await this.model.findById(id).select('+administrativeNotes').lean().exec();
    if (!row) throw missing();
    return detailDto(row);
  }
  async update(id: string, raw: UpdateRegistrationInput) {
    const input = updateRegistrationSchema.parse(raw);
    return this.transaction(async (session) => {
      const row = await this.model
        .findById(id)
        .select('+administrativeNotes')
        .session(session)
        .exec();
      if (!row) throw missing();
      const next = input.status;
      if (next && next !== row.status) {
        if (!registrationTransitions[row.status].includes(next))
          throw conflict('Invalid registration status transition');
        if (next === 'attended') {
          if (!row.lecture)
            throw conflict('Attendance is only available for lecture registrations');
          await this.lectures.assertAttendance(row.lecture.toString(), session);
        }
        if (row.status === 'cancelled') {
          if (row.lecture) await this.lectures.reserve(row.lecture.toString(), session);
          else await this.courses.registrationTarget(row.course!.toString(), session);
        } else if (next === 'cancelled' && row.lecture)
          await this.lectures.release(row.lecture.toString(), session);
        row.status = next;
      }
      if (input.administrativeNotes !== undefined)
        row.administrativeNotes = input.administrativeNotes;
      await row.save({ session });
      return detailDto(row);
    });
  }
  async exportCsv(query: RegistrationQuery) {
    // A bounded export avoids buffering an unbounded amount of personal information.
    const rows = await this.model
      .find(this.filter(query))
      .select(`${listProjection} phone email`)
      .sort({ createdAt: query.sort === 'oldest' ? 1 : -1, _id: query.sort === 'oldest' ? 1 : -1 })
      .limit(5001)
      .lean()
      .exec();
    if (rows.length > 5000)
      throw new AppError(409, 'EXPORT_TOO_LARGE', 'Narrow filters to at most 5000 registrations');
    const header = [
      'Registration reference',
      'Student name',
      'Phone',
      'Email',
      'Registration type',
      'Target name',
      'Status',
      'Registration date',
    ];
    return (
      '\uFEFF' +
      [
        header,
        ...rows.map((row) => [
          row.reference,
          row.fullName,
          row.phone,
          row.email ?? '',
          row.targetType,
          row.targetName,
          row.status,
          row.createdAt.toISOString(),
        ]),
      ]
        .map((cells) => cells.map(csvCell).join(','))
        .join('\r\n') +
      '\r\n'
    );
  }
}
