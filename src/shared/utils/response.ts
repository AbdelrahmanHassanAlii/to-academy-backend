import type { Response } from 'express';

export function success<T>(
  res: Response,
  data: T,
  message: string,
  status = 200,
  meta: { page: number; limit: number; total: number; totalPages: number } | null = null,
): void {
  res.status(status).json({ success: true, message, data, meta });
}
