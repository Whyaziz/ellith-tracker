import type { Request, Response, NextFunction } from 'express';
import { logger } from './logger.js';
import { ZodError } from 'zod';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled request error');

  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validasi input gagal',
      details: err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  const statusCode = typeof err.statusCode === 'number' ? err.statusCode : 500;
  const message = err.message || 'Terjadi kesalahan pada server';

  res.status(statusCode).json({
    error: message,
  });
}
