import { Schema, type Connection, type Model, type Types } from 'mongoose';
import { CATEGORY_SLUG_PATTERN, normalizeCategorySlug } from '../utils/category.utils.js';

export interface CategoryRecord {
  name: { ar: string; en?: string };
  slug: string;
  description: { ar?: string; en?: string };
  image: Types.ObjectId | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export function createCategoryModel(connection: Connection): Model<CategoryRecord> {
  if (connection.models.Category) return connection.models.Category as Model<CategoryRecord>;
  const name = new Schema(
    {
      ar: { type: String, required: true, trim: true, maxlength: 120 },
      en: { type: String, trim: true, maxlength: 120 },
    },
    { _id: false, strict: 'throw' },
  );
  const description = new Schema(
    {
      ar: { type: String, trim: true, maxlength: 4000 },
      en: { type: String, trim: true, maxlength: 4000 },
    },
    { _id: false, strict: 'throw' },
  );
  const schema = new Schema<CategoryRecord>(
    {
      name: { type: name, required: true },
      slug: {
        type: String,
        required: true,
        maxlength: 120,
        set: normalizeCategorySlug,
        match: CATEGORY_SLUG_PATTERN,
      },
      description: { type: description, default: () => ({}) },
      image: { type: Schema.Types.ObjectId, default: null },
      isActive: { type: Boolean, default: true, required: true },
      sortOrder: {
        type: Number,
        default: 0,
        min: 0,
        max: 1_000_000,
        validate: Number.isInteger,
        required: true,
      },
    },
    { timestamps: true, autoIndex: false, strict: 'throw' },
  );
  schema.index({ slug: 1 }, { unique: true });
  schema.index({ isActive: 1, sortOrder: 1, _id: 1 });
  schema.index({ sortOrder: 1, _id: 1 });
  return connection.model<CategoryRecord>('Category', schema);
}
