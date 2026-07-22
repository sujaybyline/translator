import type { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  statusCode: number;
  expose: boolean;

  constructor(message: string, statusCode = 400, expose = true) {
    super(message);
    this.statusCode = statusCode;
    this.expose = expose;
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error('[error]', err);

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.expose ? err.message : 'An unexpected error occurred.',
    });
    return;
  }

  if (err && typeof err === 'object' && 'code' in err) {
    const code = String((err as { code?: string }).code);
    if (code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({
        success: false,
        error: 'File is too large. Maximum size is 10 MB.',
      });
      return;
    }
  }

  const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
  // Avoid leaking internals
  const safe =
    /GEMINI_API_KEY|ECONNREFUSED|ENOENT|mysql/i.test(message)
      ? message.includes('GEMINI_API_KEY')
        ? message
        : 'A server error occurred. Please try again later.'
      : message;

  res.status(500).json({ success: false, error: safe });
}
