import { Schema, type Model, type Connection, type Types } from 'mongoose';
import type { LocalizedCourseText } from '../../courses/model/index.js';
export interface SettingsRecord {
  _id: string;
  academyName: LocalizedCourseText;
  about: LocalizedCourseText | null;
  logo: Types.ObjectId | null;
  contactPhone: string | null;
  whatsappNumber: string | null;
  contactEmail: string | null;
  address: LocalizedCourseText | null;
  socialLinks: {
    facebook?: string;
    instagram?: string;
    linkedin?: string;
    youtube?: string;
    tiktok?: string;
    x?: string;
  };
  footer: LocalizedCourseText | null;
  defaultSeo: { title?: LocalizedCourseText; description?: LocalizedCourseText };
  createdAt: Date;
  updatedAt: Date;
}
export function createSettingsModel(connection: Connection): Model<SettingsRecord> {
  if (connection.models.Settings) return connection.models.Settings as Model<SettingsRecord>;
  const localized = (max: number) =>
    new Schema(
      {
        ar: { type: String, required: true, maxlength: max },
        en: { type: String, maxlength: max },
      },
      { _id: false, strict: 'throw' },
    );
  const schema = new Schema<SettingsRecord>(
    {
      _id: { type: String, enum: ['academy'], default: 'academy', immutable: true },
      academyName: {
        type: localized(200),
        default: () => ({ ar: 'أكاديمية TO', en: 'TO Academy' }),
      },
      about: { type: localized(10000), default: null },
      logo: { type: Schema.Types.ObjectId, ref: 'Media', default: null },
      contactPhone: { type: String, default: null },
      whatsappNumber: { type: String, default: null },
      contactEmail: { type: String, default: null },
      address: { type: localized(1000), default: null },
      footer: { type: localized(1000), default: null },
      socialLinks: {
        type: new Schema(
          {
            facebook: String,
            instagram: String,
            linkedin: String,
            youtube: String,
            tiktok: String,
            x: String,
          },
          { _id: false, strict: 'throw' },
        ),
        default: () => ({}),
      },
      defaultSeo: {
        type: new Schema(
          { title: localized(200), description: localized(600) },
          { _id: false, strict: 'throw' },
        ),
        default: () => ({}),
      },
    },
    { timestamps: true, autoIndex: false, strict: 'throw', minimize: false },
  );
  return connection.model<SettingsRecord>('Settings', schema, 'settings');
}
