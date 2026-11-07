import type { RequestHandler } from 'express';
import type { RegistrationService } from '../service/index.js';
import type {
  CreateRegistrationInput,
  UpdateRegistrationInput,
  RegistrationQuery,
} from '../validators/index.js';
import { success } from '../../../shared/utils/response.js';
export function registrationController(service: RegistrationService) {
  const create: RequestHandler = async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    success(
      res,
      await service.create(res.locals.registrationInput as CreateRegistrationInput),
      'Registration received; the academy will review your request',
      201,
    );
  };
  const list: RequestHandler = async (_req, res) => {
    const result = await service.list(res.locals.registrationQuery as RegistrationQuery);
    success(res, result.data, 'Registrations retrieved', 200, result.meta);
  };
  const detail: RequestHandler = async (_req, res) => {
    success(
      res,
      await service.getById((res.locals.registrationParams as { id: string }).id),
      'Registration retrieved',
    );
  };
  const update: RequestHandler = async (_req, res) => {
    success(
      res,
      await service.update(
        (res.locals.registrationParams as { id: string }).id,
        res.locals.registrationInput as UpdateRegistrationInput,
      ),
      'Registration updated',
    );
  };
  const exportCsv: RequestHandler = async (_req, res) => {
    const csv = await service.exportCsv(res.locals.registrationQuery as RegistrationQuery);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', 'attachment; filename="registrations.csv"');
    res.type('text/csv; charset=utf-8').send(csv);
  };
  return { create, list, detail, update, exportCsv };
}
