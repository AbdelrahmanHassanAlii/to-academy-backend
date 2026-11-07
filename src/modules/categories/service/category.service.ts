import { Types, type Model } from 'mongoose';
import type { CategoryRecord } from '../model/index.js';
import type {
  CategoryQuery,
  CreateCategoryInput,
  UpdateCategoryInput,
} from '../validators/index.js';
import { categorySlugValueSchema } from '../validators/index.js';
import {
  categoryDto,
  escapeCategorySearch,
  isDuplicateCategory,
} from '../utils/index.js';
import { AppError } from '../../../shared/errors/app-error.js';

const missing = () => new AppError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
const conflict = () => new AppError(409, 'CATEGORY_SLUG_EXISTS', 'Category slug already exists');

export class CategoryService {
  constructor(private readonly model: Model<CategoryRecord>) {}

  async ensureIndexes(): Promise<void> {
    await this.model.createIndexes();
  }

  async list(query: CategoryQuery, admin = false) {
    const filter: {
      isActive?: boolean;
      $or?: Record<string, { $regex: string; $options: string }>[];
    } = {};
    if (!admin) filter.isActive = true;
    else if (query.isActive !== undefined) filter.isActive = query.isActive;
    if (query.q) {
      const match = { $regex: escapeCategorySearch(query.q), $options: 'i' };
      filter.$or = [{ 'name.ar': match }, { 'name.en': match }, { slug: match }];
    }
    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ sortOrder: 1, _id: 1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean()
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return {
      data: items.map((item) => categoryDto(item, admin)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async getPublicBySlug(slug: string) {
    const category = await this.model.findOne({ slug, isActive: true }).lean().exec();
    if (!category) throw missing();
    return categoryDto(category);
  }

  async getById(id: string) {
    const category = await this.model.findById(id).lean().exec();
    if (!category) throw missing();
    return categoryDto(category, true);
  }

  async create(input: CreateCategoryInput) {
    const parsed = categorySlugValueSchema.safeParse(input.slug ?? input.name.en ?? input.name.ar);
    if (!parsed.success)
      throw new AppError(400, 'VALIDATION_ERROR', 'A valid category slug is required');
    try {
      const category = await this.model.create({
        name: { ar: input.name.ar, ...(input.name.en !== undefined ? { en: input.name.en } : {}) },
        slug: parsed.data,
        description: {
          ...(input.description?.ar !== undefined ? { ar: input.description.ar } : {}),
          ...(input.description?.en !== undefined ? { en: input.description.en } : {}),
        },
        image: input.image ? new Types.ObjectId(input.image) : null,
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? 0,
      });
      return categoryDto(category, true);
    } catch (error) {
      if (isDuplicateCategory(error)) throw conflict();
      throw error;
    }
  }

  async update(id: string, input: UpdateCategoryInput) {
    // Explicit fields prevent operator injection/mass assignment even for internal callers.
    const fields: Record<string, unknown> = {};
    for (const field of [
      'name',
      'slug',
      'description',
      'image',
      'isActive',
      'sortOrder',
    ] as const) {
      if (input[field] !== undefined) fields[field] = input[field];
    }
    try {
      const category = await this.model
        .findByIdAndUpdate(id, { $set: fields }, { returnDocument: 'after', runValidators: true })
        .lean()
        .exec();
      if (!category) throw missing();
      return categoryDto(category, true);
    } catch (error) {
      if (isDuplicateCategory(error)) throw conflict();
      throw error;
    }
  }

  async deactivate(id: string) {
    // Retain the document/id so present and future course references cannot be orphaned.
    return this.update(id, { isActive: false });
  }

}
