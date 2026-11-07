import type { Types } from 'mongoose';
import type { AdminRecord } from '../model/admin.model.js';

export interface AdminProfile {
  id: string;
  name: string;
  email: string;
  role: 'admin';
  lastLoginAt: string | null;
}

export function adminProfile(
  admin: Pick<AdminRecord, 'name' | 'email' | 'role' | 'lastLoginAt'> & { _id: Types.ObjectId },
): AdminProfile {
  return {
    id: admin._id.toString(),
    name: admin.name,
    email: admin.email,
    role: admin.role,
    lastLoginAt: admin.lastLoginAt?.toISOString() ?? null,
  };
}
