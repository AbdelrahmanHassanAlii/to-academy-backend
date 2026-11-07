import { type Model } from 'mongoose';
import type { SettingsRecord } from '../model/settings.model.js';
import {
  updateSettingsSchema,
  type UpdateSettingsInput,
} from '../validators/settings.validator.js';
import { settingsDefaults } from '../utils/settings.utils.js';
import { MediaReferences } from '../../../infrastructure/storage/media-references.js';
import { isDuplicateCourse } from '../../courses/utils/index.js';
const text = (v: SettingsRecord['about']) =>
  v ? { ar: v.ar, ...(v.en ? { en: v.en } : {}) } : null;
export class SettingsService {
  private readonly media: MediaReferences;
  constructor(private readonly model: Model<SettingsRecord>) {
    this.media = new MediaReferences(model.db);
  }
  async ensureIndexes() {
    await this.model.createIndexes();
  }
  async get() {
    const row = await this.model.findById('academy').lean();
    if (!row) return settingsDefaults();
    const socialLinks: Record<string, string> = {};
    for (const key of ['facebook', 'instagram', 'linkedin', 'youtube', 'tiktok', 'x'] as const)
      if (row.socialLinks?.[key]) socialLinks[key] = row.socialLinks[key];
    return {
      academyName: text(row.academyName)!,
      about: text(row.about),
      logo: row.logo?.toString() ?? null,
      contactPhone: row.contactPhone,
      whatsappNumber: row.whatsappNumber,
      contactEmail: row.contactEmail,
      address: text(row.address),
      socialLinks,
      footer: text(row.footer),
      defaultSeo: {
        ...(row.defaultSeo?.title ? { title: text(row.defaultSeo.title) } : {}),
        ...(row.defaultSeo?.description ? { description: text(row.defaultSeo.description) } : {}),
      },
    };
  }
  async update(raw: UpdateSettingsInput) {
    const input = updateSettingsSchema.parse(raw);
    // Fixed _id provides the singleton constraint. Atomic field updates preserve unrelated concurrent edits.
    const save = async (upsert: boolean) => {
      await this.media.run(input.logo, true, async (session) => {
        await this.model.findOneAndUpdate(
          { _id: 'academy' },
          { $set: input },
          {
            upsert,
            returnDocument: 'after',
            runValidators: true,
            setDefaultsOnInsert: true,
            session: session ?? null,
          },
        );
      });
    };
    try {
      await save(true);
    } catch (error) {
      if (!isDuplicateCourse(error)) throw error;
      await save(false);
    }
    return this.get();
  }
}
