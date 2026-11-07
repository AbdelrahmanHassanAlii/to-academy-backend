import type { RequestHandler } from 'express';
import type { AdminService } from '../service/admin.service.js';
import type { AdminProfile } from '../utils/admin-profile.js';
import type { ProfileUpdateInput } from '../validators/admin.validators.js';
import { success } from '../../../shared/utils/response.js';

export function adminController(service: AdminService) {
  const me: RequestHandler = (_req, res) => {
    success(res, res.locals.admin, 'Administrator retrieved');
  };
  const update: RequestHandler = async (_req, res) => {
    const admin = res.locals.admin as AdminProfile;
    const profile = await service.updateProfile(
      admin.id,
      res.locals.validated as ProfileUpdateInput,
    );
    success(res, profile, 'Administrator updated');
  };
  return { me, update };
}
