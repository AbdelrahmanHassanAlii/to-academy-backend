import { randomUUID } from 'node:crypto';
import { Schema, type Connection, type Model, type Types } from 'mongoose';
import { REGISTRATION_STATUSES, normalizePhone } from '../utils/index.js';
export interface RegistrationRecord {
  reference: string;
  fullName: string;
  phone: string;
  email: string | null;
  targetType: 'lecture' | 'course';
  lecture: Types.ObjectId | null;
  course: Types.ObjectId | null;
  targetName: string;
  status: (typeof REGISTRATION_STATUSES)[number];
  privacyConsentAt: Date;
  administrativeNotes: string;
  createdAt: Date;
  updatedAt: Date;
}
export function createRegistrationModel(connection: Connection): Model<RegistrationRecord> {
  if (connection.models.Registration)
    return connection.models.Registration as Model<RegistrationRecord>;
  const schema = new Schema<RegistrationRecord>(
    {
      reference: { type: String, default: () => randomUUID(), required: true, immutable: true },
      fullName: { type: String, trim: true, required: true, minlength: 2, maxlength: 200 },
      phone: {
        type: String,
        required: true,
        set: normalizePhone,
        immutable: true,
        match: /^\+[1-9]\d{6,14}$/,
      },
      email: { type: String, trim: true, lowercase: true, default: null, maxlength: 254 },
      targetType: { type: String, enum: ['lecture', 'course'], required: true, immutable: true },
      lecture: { type: Schema.Types.ObjectId, ref: 'Lecture', default: null, immutable: true },
      course: { type: Schema.Types.ObjectId, ref: 'Course', default: null, immutable: true },
      targetName: { type: String, required: true, maxlength: 200 },
      status: { type: String, enum: REGISTRATION_STATUSES, default: 'pending' },
      privacyConsentAt: { type: Date, required: true, immutable: true },
      administrativeNotes: {
        type: String,
        trim: true,
        default: '',
        maxlength: 5000,
        select: false,
      },
    },
    { timestamps: true, autoIndex: false, strict: 'throw', optimisticConcurrency: true },
  );
  schema.pre('validate', function () {
    if (
      this.targetType === 'lecture'
        ? !this.lecture || !!this.course
        : !this.course || !!this.lecture
    )
      this.invalidate('targetType', 'Exactly one matching target is required');
  });
  schema.index({ reference: 1 }, { unique: true });
  schema.index(
    { lecture: 1, phone: 1 },
    { unique: true, partialFilterExpression: { targetType: 'lecture' } },
  );
  schema.index(
    { course: 1, phone: 1 },
    { unique: true, partialFilterExpression: { targetType: 'course' } },
  );
  schema.index({ status: 1, createdAt: -1, _id: -1 });
  schema.index({ targetType: 1, status: 1, createdAt: -1, _id: -1 });
  schema.index({ lecture: 1, status: 1, createdAt: -1, _id: -1 });
  schema.index({ course: 1, status: 1, createdAt: -1, _id: -1 });
  schema.index({ createdAt: -1, _id: -1 });
  return connection.model<RegistrationRecord>('Registration', schema);
}
