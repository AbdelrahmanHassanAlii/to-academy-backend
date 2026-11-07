import type { RequestHandler } from 'express';
import type { CategoryService } from '../service/index.js';
import type {
  CategoryQuery,
  CreateCategoryInput,
  UpdateCategoryInput,
} from '../validators/index.js';
import { success } from '../../../shared/utils/response.js';

export function categoryController(service: CategoryService) {
  const listPublic: RequestHandler = async (_req, res) => {
    const result = await service.list(res.locals.categoryQuery as CategoryQuery);
    success(res, result.data, 'Categories retrieved', 200, result.meta);
  };
  const listAdmin: RequestHandler = async (_req, res) => {
    const result = await service.list(res.locals.categoryQuery as CategoryQuery, true);
    success(res, result.data, 'Categories retrieved', 200, result.meta);
  };
  const publicDetail: RequestHandler = async (_req, res) => {
    success(
      res,
      await service.getPublicBySlug((res.locals.categoryParams as { slug: string }).slug),
      'Category retrieved',
    );
  };
  const adminDetail: RequestHandler = async (_req, res) => {
    success(
      res,
      await service.getById((res.locals.categoryParams as { id: string }).id),
      'Category retrieved',
    );
  };
  const create: RequestHandler = async (_req, res) => {
    success(
      res,
      await service.create(res.locals.categoryInput as CreateCategoryInput),
      'Category created',
      201,
    );
  };
  const update: RequestHandler = async (_req, res) => {
    success(
      res,
      await service.update(
        (res.locals.categoryParams as { id: string }).id,
        res.locals.categoryInput as UpdateCategoryInput,
      ),
      'Category updated',
    );
  };
  const deactivate: RequestHandler = async (_req, res) => {
    success(
      res,
      await service.deactivate((res.locals.categoryParams as { id: string }).id),
      'Category deactivated',
    );
  };
  return { listPublic, listAdmin, publicDetail, adminDetail, create, update, deactivate };
}
