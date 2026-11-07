import { Types, type Connection, type ClientSession } from 'mongoose';
import { AppError } from '../../shared/errors/app-error.js';
export const MEDIA_BUCKET = 'academy_media';
// Leaf integration service: no dependency on business models, controllers or routes.
export class MediaReferences {
  constructor(private readonly connection: Connection) {}
  async run<T>(
    id: string | null | undefined,
    requirePublic: boolean,
    save: (session?: ClientSession) => Promise<T>,
  ): Promise<T> {
    if (!id) return save();
    if (!/^[a-f0-9]{24}$/i.test(id))
      throw new AppError(400, 'MEDIA_INVALID', 'Invalid media reference');
    return this.connection.transaction(async (session) => {
      const row = await this.connection.collection('media').findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
          state: 'ready',
          ...(requirePublic ? { visibility: 'public' } : {}),
        },
        { $inc: { guard: 1 } },
        { session, returnDocument: 'after' },
      );
      if (!row || !['image/jpeg', 'image/png', 'image/webp'].includes(row.mimeType as string))
        throw new AppError(
          409,
          'MEDIA_UNAVAILABLE',
          'Reference requires an existing ready image with suitable visibility',
        );
      const file = await this.connection
        .collection(MEDIA_BUCKET + '.files')
        .findOne({ _id: row.gridfsId }, { session, projection: { _id: 1 } });
      if (!file) throw new AppError(409, 'MEDIA_UNAVAILABLE', 'Referenced image file is missing');
      return save(session);
    });
  }
  async assertUnused(id: Types.ObjectId, session: ClientSession) {
    for (const [collection, field] of [
      ['courses', 'thumbnail'],
      ['lectures', 'thumbnail'],
      ['articles', 'thumbnail'],
      ['settings', 'logo'],
    ]) {
      if (
        await this.connection
          .collection(collection!)
          .findOne({ [field!]: id }, { session, projection: { _id: 1 } })
      )
        throw new AppError(
          409,
          'MEDIA_REFERENCED',
          'Remove or replace all content references before deleting this image',
        );
    }
  }
}
