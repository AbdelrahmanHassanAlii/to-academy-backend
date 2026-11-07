import { Types, type Model } from 'mongoose';
import type { AdminRecord } from '../model/admin.model.js';
import {
  initialAdminSchema,
  type InitialAdminInput,
  type ProfileUpdateInput,
} from '../validators/admin.validators.js';
import { adminProfile } from '../utils/admin-profile.js';
import { AppError } from '../../../shared/errors/app-error.js';
import { hashPassword } from '../../auth/utils/password.js';

export class AdminService {
  constructor(private readonly model: Model<AdminRecord>) {}

  async ensureIndexes(): Promise<void> {
    await this.model.createIndexes();
  }

  async createInitialAdmin(input: InitialAdminInput) {
    const parsed = initialAdminSchema.parse(input);
    try {
      const admin = await this.model.create({
        name: parsed.name,
        email: parsed.email,
        passwordHash: await hashPassword(parsed.password),
        role: 'admin',
        isActive: true,
      });
      return adminProfile(admin);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
        throw new AppError(409, 'ADMIN_EXISTS', 'An administrator with this email already exists');
      }
      throw error;
    }
  }

  async findCredentials(email: string) {
    return this.model.findOne({ email }).select('+passwordHash').exec();
  }

  async getActiveById(id: string) {
    if (!Types.ObjectId.isValid(id)) return null;
    const admin = await this.model.findOne({ _id: id, isActive: true }).exec();
    return admin ? adminProfile(admin) : null;
  }

  async recordLogin(id: string) {
    const admin = await this.model
      .findOneAndUpdate(
        { _id: id, isActive: true },
        { $set: { lastLoginAt: new Date() } },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();
    if (!admin) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    return adminProfile(admin);
  }

  async updateProfile(id: string, input: ProfileUpdateInput) {
    const admin = await this.model
      .findOneAndUpdate(
        { _id: id, isActive: true },
        { $set: { name: input.name } },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();
    if (!admin) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    return adminProfile(admin);
  }
}
