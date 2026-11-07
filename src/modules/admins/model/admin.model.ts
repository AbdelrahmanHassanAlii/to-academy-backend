import { Schema, type Connection, type Model } from 'mongoose';

export interface AdminRecord {
  name: string;
  email: string;
  passwordHash: string;
  role: 'admin';
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function createAdminModel(connection: Connection): Model<AdminRecord> {
  if (connection.models.Admin) return connection.models.Admin as Model<AdminRecord>;
  const schema = new Schema<AdminRecord>(
    {
      name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
      email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
      passwordHash: { type: String, required: true, select: false },
      role: { type: String, enum: ['admin'], required: true, default: 'admin' },
      isActive: { type: Boolean, required: true, default: true },
      lastLoginAt: { type: Date, default: null },
    },
    {
      timestamps: true,
      autoIndex: false,
      toJSON: {
        transform: (_doc, result) => {
          Reflect.deleteProperty(result, 'passwordHash');
          Reflect.deleteProperty(result, '__v');
          return result;
        },
      },
    },
  );
  schema.index({ email: 1 }, { unique: true });
  return connection.model<AdminRecord>('Admin', schema);
}
