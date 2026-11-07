import { randomBytes } from 'node:crypto';
import type { AdminService } from '../../admins/service/admin.service.js';
import type { LoginInput } from '../validators/auth.validators.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { AppError } from '../../../shared/errors/app-error.js';

// Runtime-generated, noncredential hash equalizes bcrypt work for unknown accounts without a hardcoded hash.
let dummyHash: Promise<string> | undefined;

export class AuthService {
  constructor(private readonly admins: AdminService) {}

  async login(input: LoginInput) {
    const admin = await this.admins.findCredentials(input.email);
    dummyHash ??= hashPassword(randomBytes(32).toString('base64url'));
    const valid = await verifyPassword(input.password, admin?.passwordHash ?? (await dummyHash));
    if (!admin || !valid || !admin.isActive || admin.role !== 'admin') {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }
    return this.admins.recordLogin(admin._id.toString());
  }
}
