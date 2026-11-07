import type { RequestHandler } from 'express';
import type { ArticleService } from '../service/article.service.js';
import type {
  CreateArticleInput,
  UpdateArticleInput,
  ArticleQuery,
} from '../validators/article.validator.js';
import { success } from '../../../shared/utils/response.js';
export function articleController(service: ArticleService) {
  const list =
    (admin: boolean): RequestHandler =>
    async (_req, res) => {
      const r = await service.list(res.locals.articleQuery as ArticleQuery, admin);
      success(res, r.data, 'Articles retrieved', 200, r.meta);
    };
  const publicDetail: RequestHandler = async (_req, res) => {
    success(
      res,
      await service.getPublicBySlug((res.locals.articleParams as { slug: string }).slug),
      'Article retrieved',
    );
  };
  const adminDetail: RequestHandler = async (_req, res) => {
    success(
      res,
      await service.getById((res.locals.articleParams as { id: string }).id),
      'Article retrieved',
    );
  };
  const create: RequestHandler = async (_req, res) => {
    success(
      res,
      await service.create(res.locals.articleInput as CreateArticleInput),
      'Article created',
      201,
    );
  };
  const update: RequestHandler = async (_req, res) => {
    success(
      res,
      await service.update(
        (res.locals.articleParams as { id: string }).id,
        res.locals.articleInput as UpdateArticleInput,
      ),
      'Article updated',
    );
  };
  const archive: RequestHandler = async (_req, res) => {
    success(
      res,
      await service.archive((res.locals.articleParams as { id: string }).id),
      'Article archived',
    );
  };
  return {
    listPublic: list(false),
    listAdmin: list(true),
    publicDetail,
    adminDetail,
    create,
    update,
    archive,
  };
}
