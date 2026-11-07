import { Schema, type Connection, type Model, type Types } from 'mongoose';
export interface MediaRecord {
  originalFilename: string;
  filename: string;
  mimeType: string;
  size: number;
  gridfsId: Types.ObjectId;
  uploadedBy: Types.ObjectId;
  visibility: 'public' | 'private';
  state: 'pending' | 'ready' | 'deleting';
  guard: number;
  createdAt: Date;
  updatedAt: Date;
}
export function createMediaModel(connection: Connection): Model<MediaRecord> {
  if (connection.models.Media) return connection.models.Media as Model<MediaRecord>;
  const schema = new Schema<MediaRecord>(
    {
      originalFilename: { type: String, required: true, maxlength: 200 },
      filename: { type: String, required: true },
      mimeType: { type: String, required: true, enum: ['image/jpeg', 'image/png', 'image/webp'] },
      size: { type: Number, default: 0, min: 0, max: 5 * 1024 * 1024 },
      gridfsId: { type: Schema.Types.ObjectId, required: true },
      uploadedBy: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
      visibility: { type: String, enum: ['private', 'public'], default: 'private' },
      state: { type: String, enum: ['pending', 'ready', 'deleting'], default: 'pending' },
      guard: { type: Number, default: 0 },
    },
    { timestamps: true, autoIndex: false, strict: 'throw' },
  );
  schema.index({ gridfsId: 1 }, { unique: true });
  schema.index({ state: 1, createdAt: -1, _id: -1 });
  return connection.model<MediaRecord>('Media', schema);
}
