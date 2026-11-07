import type { RequestHandler } from 'express';
import type { LectureService } from '../service/index.js';
import type { CreateLectureInput, UpdateLectureInput, LectureQuery } from '../validators/index.js';
import { success } from '../../../shared/utils/response.js';
export function lectureController(service: LectureService) {
  const list =
    (admin: boolean): RequestHandler =>
    async (_req, res) => {
      const result = await service.list(res.locals.lectureQuery as LectureQuery, admin);
      success(res, result.data, 'Lectures retrieved', 200, result.meta);
    };
  const publicDetail: RequestHandler = async (_req, res) => {
    success(
      res,
      await service.getPublicBySlug((res.locals.lectureParams as { slug: string }).slug),
      'Lecture retrieved',
    );
  };
  const adminDetail: RequestHandler = async (_req, res) => {
    success(
      res,
      await service.getById((res.locals.lectureParams as { id: string }).id),
      'Lecture retrieved',
    );
  };
  const create: RequestHandler = async (_req, res) => {
    success(
      res,
      await service.create(res.locals.lectureInput as CreateLectureInput),
      'Lecture created',
      201,
    );
  };
  const update: RequestHandler = async (_req, res) => {
    success(
      res,
      await service.update(
        (res.locals.lectureParams as { id: string }).id,
        res.locals.lectureInput as UpdateLectureInput,
      ),
      'Lecture updated',
    );
  };
  const cancel: RequestHandler = async (_req, res) => {
    success(
      res,
      await service.cancel((res.locals.lectureParams as { id: string }).id),
      'Lecture cancelled',
    );
  };
  return {
    listPublic: list(false),
    listAdmin: list(true),
    publicDetail,
    adminDetail,
    create,
    update,
    cancel,
  };
}
