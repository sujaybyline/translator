import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/errorHandler.js';
import * as jobService from '../services/translationJobService.js';
import { pingDatabase, isDatabaseAvailable, saveAppSettings } from '../db/pool.js';
import { getPublicAppSettings } from '../services/appSettingsService.js';
import { isAiProvider } from '../translators/translatorFactory.js';
import { isSupportedTargetLanguage, SUPPORTED_TARGET_LANGUAGES } from '../types/index.js';

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

    const targetLanguage =
      typeof req.body.targetLanguage === 'string' ? req.body.targetLanguage.trim() : undefined;
    if (targetLanguage && !isSupportedTargetLanguage(targetLanguage)) {
      throw new AppError(
        `Unsupported target language "${targetLanguage}". Supported: ${Object.keys(SUPPORTED_TARGET_LANGUAGES).join(', ')}`,
        400,
      );
    }

    const job = await jobService.startTranslation(jobId, targetLanguage);
    res.json({ success: true, data: job });
  } catch (err) {
    next(err);
  }
}

export async function clearJob(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const cleared = await jobService.clearJob(req.params.jobId);
    if (!cleared) {
      throw new AppError('This job cannot be cleared or cancelled in its current state.', 409);
    }
    res.json({ success: true, data: null });
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

export async function downloadJobSourceOnly(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await jobService.getDownloadSourceContent(req.params.jobId);
    if (!result) {
      throw new AppError(
        'Source-only download is not available. The job may not be completed or the file has been removed.',
        404,
      );
    }
    res.download(result.filePath, result.filename);
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
  const settings = await getPublicAppSettings();

  res.json({
    success: true,
    data: {
      status: 'ok',
      database: isDatabaseAvailable() && dbOk ? 'connected' : 'unavailable',
      provider: settings.provider,
      model: settings.model,
      hasApiKey: settings.hasApiKey,
      aiConfigured: Boolean(settings.provider && settings.model && settings.hasApiKey),
    },
  });
}

export async function getSettings(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const settings = await getPublicAppSettings();
    res.json({ success: true, data: settings });
  } catch (err) {
    next(err);
  }
}

export async function saveSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { provider, model, api_key } = req.body as {
      provider?: string;
      model?: string;
      api_key?: string;
    };

    if (!provider || !model) {
      throw new AppError('provider and model are required.', 400);
    }

    if (!isAiProvider(provider)) {
      throw new AppError('provider must be "gemini" or "anthropic".', 400);
    }

    const trimmedModel = String(model).trim();
    if (!trimmedModel) {
      throw new AppError('model is required.', 400);
    }

    const trimmedKey = typeof api_key === 'string' ? api_key.trim() : '';
    const publicSettings = await getPublicAppSettings();
    if (!trimmedKey && !publicSettings.hasApiKey) {
      throw new AppError('api_key is required.', 400);
    }

    await saveAppSettings({
      provider,
      model: trimmedModel,
      api_key: trimmedKey || undefined,
    });

    res.json({
      success: true,
      message: 'Settings saved successfully.',
    });
  } catch (err) {
    next(err);
  }
}

