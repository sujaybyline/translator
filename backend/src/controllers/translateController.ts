import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/errorHandler.js';
import * as jobService from '../services/translationJobService.js';
import { pingDatabase, isDatabaseAvailable } from '../db/pool.js';
import { config } from '../config.js';

export async function uploadFile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) {
      throw new AppError('No file uploaded. Please select a .xlf or .xliff file.');
    }
    const job = await jobService.createJobFromUpload({
      originalname: req.file.originalname,
      path: req.file.path,
      size: req.file.size,
    });
    res.status(201).json({ success: true, data: job });
  } catch (err) {
    next(err);
  }
}

export async function startTranslation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const jobId = String(req.body.jobId ?? req.params.jobId ?? '');
    if (!jobId) throw new AppError('jobId is required.');
    const job = await jobService.startTranslation(jobId);
    res.json({ success: true, data: job });
  } catch (err) {
    next(err);
  }
}

export async function getJob(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const job = await jobService.getJobAsync(req.params.jobId);
    if (!job) throw new AppError('Translation job not found.', 404);
    res.json({ success: true, data: job });
  } catch (err) {
    next(err);
  }
}

export async function getPreview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 20);
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const preview = await jobService.getPreview(req.params.jobId, { q, page, pageSize });
    res.json({ success: true, data: preview });
  } catch (err) {
    next(err);
  }
}

export async function downloadJob(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const download = await jobService.getDownloadPath(req.params.jobId);
    if (!download) {
      throw new AppError('Download not available. Translation may still be processing or failed validation.', 404);
    }
    res.download(download.filePath, download.filename);
  } catch (err) {
    next(err);
  }
}

export async function getHistory(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const history = await jobService.listHistory();
    res.json({ success: true, data: history });
  } catch (err) {
    next(err);
  }
}

export async function health(_req: Request, res: Response): Promise<void> {
  const dbOk = await pingDatabase();
  res.json({
    success: true,
    data: {
      status: 'ok',
      geminiConfigured: Boolean(config.geminiApiKey && config.geminiApiKey !== 'your_api_key_here'),
      database: isDatabaseAvailable() && dbOk ? 'connected' : 'unavailable',
    },
  });
}
