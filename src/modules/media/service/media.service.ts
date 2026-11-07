import { randomUUID } from 'node:crypto';
import { Writable, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import sharp from 'sharp';
import { mongo, Types, type Model } from 'mongoose';
import type { MediaRecord } from '../model/media.model.js';
import type { MediaQuery } from '../validators/media.validator.js';
import {
  IMAGE_EXTENSIONS,
  ImageValidationStream,
  safeOriginalName,
} from '../utils/image-stream.js';
import { MEDIA_BUCKET, MediaReferences } from '../../../infrastructure/storage/media-references.js';
import { AppError } from '../../../shared/errors/app-error.js';
const missing = () => new AppError(404, 'MEDIA_NOT_FOUND', 'Media not found');
type Stored = MediaRecord & { _id: Types.ObjectId };
function dto(row: Stored) {
  return {
    id: row._id.toString(),
    originalFilename: row.originalFilename,
    filename: row.filename,
    mimeType: row.mimeType,
    size: row.size,
    uploadedBy: row.uploadedBy.toString(),
    visibility: row.visibility,
    createdAt: row.createdAt.toISOString(),
    url: row.visibility === 'public' ? '/api/v1/media/' + row._id : null,
  };
}
export class MediaService {
  readonly references: MediaReferences;
  constructor(private readonly model: Model<MediaRecord>) {
    this.references = new MediaReferences(model.db);
  }
  get bucket() {
    return new mongo.GridFSBucket(this.model.db.db!, {
      bucketName: MEDIA_BUCKET,
      chunkSizeBytes: 64 * 1024,
    });
  }
  async ensureIndexes() {
    await this.model.createIndexes();
  }
  async stage(stream: Readable, mime: string, originalName: string, adminId: string) {
    const check = new ImageValidationStream(mime);
    const id = new Types.ObjectId();
    const filename = randomUUID() + '.' + IMAGE_EXTENSIONS[mime];
    let sourceError: Error | undefined;
    let streaming = false;
    const inputError = (error: Error) => {
      sourceError = error;
      if (streaming) check.destroy(error);
    };
    stream.on('error', inputError);
    try {
      await this.model.create({
        _id: id,
        gridfsId: id,
        filename,
        mimeType: mime,
        originalFilename: safeOriginalName(originalName),
        uploadedBy: adminId,
      });
      const upload = this.bucket.openUploadStreamWithId(id, filename, {
        metadata: { mediaId: id, schemaVersion: 1 },
      });
      if (sourceError || stream.destroyed) {
        upload.destroy();
        throw sourceError ?? new Error('Upload interrupted');
      }
      streaming = true;
      stream.pipe(check);
      try {
        await pipeline(check, upload);
      } finally {
        stream.unpipe(check);
        stream.resume();
      }
      // Decode only after bounded streaming storage. Decoder memory is independently pixel-limited;
      // bytes never accumulate in the multipart request handler.
      const decoder = sharp({ failOn: 'warning', limitInputPixels: 16_000_000 }).resize(1, 1).raw();
      const metadata = decoder.metadata();
      const decoded = pipeline(
        this.bucket.openDownloadStream(id),
        decoder,
        new Writable({
          write(_c, _e, cb) {
            cb();
          },
        }),
      );
      const [info] = await Promise.all([metadata, decoded]);
      if ((info.pages ?? 1) > 1)
        throw new AppError(415, 'INVALID_IMAGE', 'Animated images are not supported');
      await this.model.updateOne({ _id: id, state: 'pending' }, { $set: { size: check.size } });
      return id.toString();
    } catch (error) {
      await this.discard(id.toString());
      if (error instanceof AppError) throw error;
      if (error instanceof Error && /Mongo/.test(error.name)) throw error;
      throw new AppError(415, 'INVALID_IMAGE', 'Malformed or unsupported image');
    } finally {
      stream.off('error', inputError);
      stream.unpipe(check);
      stream.resume();
    }
  }
  async finish(id: string, visibility: 'private' | 'public') {
    const row = await this.model
      .findOneAndUpdate(
        { _id: id, state: 'pending' },
        { $set: { state: 'ready', visibility } },
        { returnDocument: 'after' },
      )
      .lean();
    if (!row) throw missing();
    return dto(row);
  }
  async discard(id: string) {
    const row = await this.model.findById(id).lean();
    if (!row) return;
    // Delete chunks explicitly as well: failed uploads may not have a files document.
    await this.model.db.collection(MEDIA_BUCKET + '.chunks').deleteMany({ files_id: row.gridfsId });
    await this.model.db.collection(MEDIA_BUCKET + '.files').deleteOne({ _id: row.gridfsId });
    await this.model.deleteOne({ _id: row._id });
  }
  async reconcile() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await this.model
      .find({ $or: [{ state: 'pending', createdAt: { $lt: cutoff } }, { state: 'deleting' }] })
      .select('_id')
      .lean();
    for (const row of rows) await this.discard(row._id.toString());
  }
  async list(query: MediaQuery) {
    const filter = {
      state: 'ready' as const,
      ...(query.visibility ? { visibility: query.visibility } : {}),
    };
    const [rows, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      this.model.countDocuments(filter),
    ]);
    return {
      data: rows.map(dto),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
  async get(id: string) {
    const row = await this.model.findOne({ _id: id, state: 'ready' }).lean();
    if (!row) throw missing();
    return dto(row);
  }
  async download(id: string, admin = false) {
    const row = await this.model
      .findOne({ _id: id, state: 'ready', ...(admin ? {} : { visibility: 'public' }) })
      .lean();
    if (!row) throw missing();
    const file = await this.model.db
      .collection(MEDIA_BUCKET + '.files')
      .findOne({ _id: row.gridfsId });
    if (!file) throw missing();
    return {
      stream: this.bucket.openDownloadStream(row.gridfsId),
      mimeType: row.mimeType,
      size: row.size,
      filename: row.filename,
    };
  }
  async remove(id: string) {
    await this.model.db.transaction(async (session) => {
      const row = await this.model.findOneAndUpdate(
        { _id: id, state: { $in: ['ready', 'deleting'] } },
        { $inc: { guard: 1 } },
        { session, returnDocument: 'after' },
      );
      if (!row) throw missing();
      await this.references.assertUnused(row._id, session);
      row.state = 'deleting';
      await row.save({ session });
    });
    await this.discard(id);
    return { id };
  }
}
