import type { RequestHandler } from 'express';
import type { SettingsService } from '../service/settings.service.js';
import type { UpdateSettingsInput } from '../validators/settings.validator.js';
import { success } from '../../../shared/utils/response.js';
export function settingsController(service: SettingsService) {
  const get: RequestHandler = async (_req, res) => {
    success(res, await service.get(), 'Settings retrieved');
  };
  const update: RequestHandler = async (_req, res) => {
    success(
      res,
      await service.update(res.locals.settingsInput as UpdateSettingsInput),
      'Settings updated',
    );
  };
  return { get, update };
}
