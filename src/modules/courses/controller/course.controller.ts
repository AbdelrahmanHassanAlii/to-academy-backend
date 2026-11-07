import type { RequestHandler } from 'express';
import type { CourseService } from '../service/index.js';
import type { CourseQuery, CreateCourseInput, UpdateCourseInput } from '../validators/index.js';
import { success } from '../../../shared/utils/response.js';

export function courseController(service: CourseService) {
  const featured: RequestHandler = async (_req, res) => {
    const result = await service.list(res.locals.courseQuery as CourseQuery, false, true);
    success(res, result.data, 'Courses retrieved', 200, result.meta);
  };
  const listPublic: RequestHandler = async (_req, res) => {
    const result = await service.list(res.locals.courseQuery as CourseQuery);
    success(res, result.data, 'Courses retrieved', 200, result.meta);
  };
  const listAdmin: RequestHandler = async (_req, res) => {
    const result = await service.list(res.locals.courseQuery as CourseQuery, true);
    success(res, result.data, 'Courses retrieved', 200, result.meta);
  };
  const publicDetail: RequestHandler = async (_req, res) => {
    success(
      res,
      await service.getPublicBySlug((res.locals.courseParams as { slug: string }).slug),
      'Course retrieved',
    );
  };
  const adminDetail: RequestHandler = async (_req, res) => {
    success(
      res,
      await service.getById((res.locals.courseParams as { id: string }).id),
      'Course retrieved',
    );
  };
  const create: RequestHandler = async (_req, res) => {
    success(
      res,
      await service.create(res.locals.courseInput as CreateCourseInput),
      'Course created',
      201,
    );
  };
  const update: RequestHandler = async (_req, res) => {
    success(
      res,
      await service.update(
        (res.locals.courseParams as { id: string }).id,
        res.locals.courseInput as UpdateCourseInput,
      ),
      'Course updated',
    );
  };
  const archive: RequestHandler = async (_req, res) => {
    success(
      res,
      await service.archive((res.locals.courseParams as { id: string }).id),
      'Course archived',
    );
  };
  return { listPublic, listAdmin, publicDetail, adminDetail, create, update, archive, featured };
}
