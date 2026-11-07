import busboy from 'busboy';
import { pipeline } from 'node:stream/promises';
import type { RequestHandler } from 'express';
import type { MediaService } from '../service/media.service.js';
import { MAX_IMAGE_SIZE } from '../utils/image-stream.js';
import { visibilitySchema, type MediaQuery } from '../validators/media.validator.js';
import { AppError } from '../../../shared/errors/app-error.js';
import { success } from '../../../shared/utils/response.js';
export function mediaController(service: MediaService) {
  const upload: RequestHandler = async (req, res) => {
    if (!req.is('multipart/form-data'))
      throw new AppError(415, 'MULTIPART_REQUIRED', 'Use multipart/form-data');
    let parser: ReturnType<typeof busboy>;
    try {
      parser = busboy({
        headers: req.headers,
        defParamCharset: 'utf8',
        limits: {
          fileSize: MAX_IMAGE_SIZE + 1,
          files: 1,
          fields: 1,
          parts: 3,
          fieldSize: 16,
          fieldNameSize: 32,
          headerPairs: 32,
        },
      });
    } catch {
      throw new AppError(400, 'INVALID_MULTIPART', 'Invalid multipart request');
    }
    let staged: string | undefined;
    let task: Promise<void> = Promise.resolve();
    let failure: unknown;
    let visibility: 'private' | 'public' = 'private';
    let seenVisibility = false;
    let files = 0;
    const bad = () => {
      failure ??= new AppError(400, 'INVALID_MULTIPART', 'Send one file and optional visibility');
    };
    parser.on('field', (name, value, info) => {
      const parsed = visibilitySchema.safeParse(value);
      if (name !== 'visibility' || seenVisibility || info.valueTruncated || !parsed.success) bad();
      else {
        visibility = parsed.data;
        seenVisibility = true;
      }
    });
    parser.on('file', (name, stream, info) => {
      stream.on('error', () => {
        failure ??= new AppError(400, 'INVALID_MULTIPART', 'Incomplete multipart request');
      });
      files++;
      if (name !== 'file' || files > 1) {
        bad();
        stream.resume();
        return;
      }
      stream.on('limit', () => {
        failure ??= new AppError(413, 'IMAGE_TOO_LARGE', 'Maximum image size is 5 MiB');
      });
      task = service
        .stage(stream, info.mimeType, info.filename ?? 'image', req.session.adminId!)
        .then((id) => {
          staged = id;
        })
        .catch((error: unknown) => {
          failure ??= error;
          stream.resume();
        });
    });
    parser.on('filesLimit', bad);
    parser.on('fieldsLimit', bad);
    parser.on('partsLimit', bad);
    const aborted = () => parser.destroy(new Error('Upload interrupted'));
    req.once('aborted', aborted);
    try {
      await new Promise<void>((resolve, reject) => {
        parser.once('close', resolve);
        parser.once('error', reject);
        req.pipe(parser);
      }).catch(() => {
        failure ??= new AppError(400, 'INVALID_MULTIPART', 'Incomplete multipart request');
      });
      await task;
      if (failure) throw failure;
      if (!staged) throw new AppError(400, 'FILE_REQUIRED', 'An image file is required');
      success(res, await service.finish(staged, visibility), 'Media uploaded', 201);
    } catch (error) {
      if (staged) await service.discard(staged);
      throw error;
    } finally {
      req.off('aborted', aborted);
    }
  };
  const download =
    (admin: boolean): RequestHandler =>
    async (_req, res) => {
      const file = await service.download((res.locals.mediaParams as { id: string }).id, admin);
      res.set({
        'Content-Type': file.mimeType,
        'Content-Length': String(file.size),
        'Content-Disposition': 'inline; filename="' + file.filename + '"',
        'Cache-Control': admin ? 'private, no-store' : 'public, max-age=0, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      });
      await pipeline(file.stream, res);
    };
  const list: RequestHandler = async (_req, res) => {
    const result = await service.list(res.locals.mediaQuery as MediaQuery);
    success(res, result.data, 'Media retrieved', 200, result.meta);
  };
  const detail: RequestHandler = async (_req, res) => {
    success(
      res,
      await service.get((res.locals.mediaParams as { id: string }).id),
      'Media retrieved',
    );
  };
  const remove: RequestHandler = async (_req, res) => {
    success(
      res,
      await service.remove((res.locals.mediaParams as { id: string }).id),
      'Media deleted',
    );
  };
  return {
    upload,
    list,
    detail,
    remove,
    publicDownload: download(false),
    adminDownload: download(true),
  };
}
