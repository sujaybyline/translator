import type { Request, Response } from 'express';
import fs from 'node:fs/promises';
import { runQAComparison, runQASingleFileReview, cancelQAJobInMemory } from '../services/qaService.js';
import type { QABatchEvent, QASegmentResult } from '../services/qaService.js';
import { SUPPORTED_TARGET_LANGUAGES } from '../types/index.js';
import * as db from '../db/pool.js';

// ── SSE helpers ───────────────────────────────────────────────────────────────

function sseHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering if present
  res.flushHeaders();
}

function sendEvent(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function resolveTargetLanguageName(code: string): string {
  return (
    SUPPORTED_TARGET_LANGUAGES[code as keyof typeof SUPPORTED_TARGET_LANGUAGES]?.name ?? code
  );
}

// ── Compare two XLIFF files (SSE) ─────────────────────────────────────────────

export async function compareXliff(req: Request, res: Response): Promise<void> {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const fileA = files?.['source']?.[0];
  const fileB = files?.['translated']?.[0];

  if (!fileA || !fileB) {
    res.status(400).json({ success: false, error: 'Both source and translated files are required.' });
    return;
  }

  const targetLanguage =
    typeof req.body.targetLanguage === 'string' ? req.body.targetLanguage.trim() : 'de';
  const targetLanguageName = resolveTargetLanguageName(targetLanguage);
  const qaJobId = typeof req.body.jobId === 'string' ? req.body.jobId.trim() : undefined;

  sseHeaders(res);

  // send real jobId immediately so frontend can sync
  sendEvent(res, 'jobStarted', { jobId: qaJobId });

  const controller = new AbortController();
  let closeTimer: NodeJS.Timeout | null = null;
  req.on('close', () => {
    closeTimer = setTimeout(() => controller.abort(), 30_000);
  });
  res.on('finish', () => { if (closeTimer) clearTimeout(closeTimer); });

  try {
    const allSegments: QASegmentResult[] = [];

    const onBatch = (event: QABatchEvent) => {
      allSegments.push(...event.segments);
      sendEvent(res, 'batch', {
        segments: event.segments,
        reviewedSoFar: event.reviewedSoFar,
        totalToReview: event.totalToReview,
      });
    };

    const result = await runQAComparison(
      fileA.path, fileA.originalname,
      fileB.path, fileB.originalname,
      targetLanguageName,
      onBatch,
      controller.signal,
      qaJobId,
    );

    sendEvent(res, 'done', result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'QA comparison failed.';
    sendEvent(res, 'error', { message });
  } finally {
    res.end();
    await Promise.all([
      fs.unlink(fileA.path).catch(() => undefined),
      fs.unlink(fileB.path).catch(() => undefined),
    ]);
  }
}

// ── Review single XLIFF file (SSE) ────────────────────────────────────────────

export async function reviewXliff(req: Request, res: Response): Promise<void> {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const reviewFile = files?.['file']?.[0];

  if (!reviewFile) {
    res.status(400).json({ success: false, error: 'file is required.' });
    return;
  }

  const targetLanguage =
    typeof req.body.targetLanguage === 'string' ? req.body.targetLanguage.trim() : 'de';
  const targetLanguageName = resolveTargetLanguageName(targetLanguage);
  const qaJobId = typeof req.body.jobId === 'string' ? req.body.jobId.trim() : undefined;

  sseHeaders(res);

  // send real jobId immediately so frontend can sync
  sendEvent(res, 'jobStarted', { jobId: qaJobId });

  const controller = new AbortController();
  let closeTimer: NodeJS.Timeout | null = null;
  req.on('close', () => {
    closeTimer = setTimeout(() => controller.abort(), 30_000);
  });
  res.on('finish', () => { if (closeTimer) clearTimeout(closeTimer); });

  try {
    const onBatch = (event: QABatchEvent) => {
      sendEvent(res, 'batch', {
        segments: event.segments,
        reviewedSoFar: event.reviewedSoFar,
        totalToReview: event.totalToReview,
      });
    };

    const result = await runQASingleFileReview(
      reviewFile.path,
      reviewFile.originalname,
      targetLanguageName,
      onBatch,
      controller.signal,
      qaJobId,
    );

    sendEvent(res, 'done', result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'QA review failed.';
    sendEvent(res, 'error', { message });
  } finally {
    res.end();
    await fs.unlink(reviewFile.path).catch(() => undefined);
  }
}

// ── Get running QA jobs ───────────────────────────────────────────────────────

export async function getRunningQAJobs(req: Request, res: Response): Promise<void> {
  try {
    const runningJobs = await db.getRunningQAJobs();
    const jobsWithSegments = await Promise.all(
      runningJobs.map(async (job) => {
        const segments = await db.getQASegments(job.id);
        return {
          ...job,
          segments: segments.map((s) => ({
            segmentId: s.segment_id,
            sourceText: s.source_text,
            translatedText: s.translated_text,
            status: s.status,
            suggestion: s.suggestion,
          })),
        };
      }),
    );
    res.json({ success: true, jobs: jobsWithSegments });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch running QA jobs.';
    res.status(500).json({ success: false, error: message });
  }
}

// ── Cancel running QA job ─────────────────────────────────────────────────────

export async function cancelQAJob(req: Request, res: Response): Promise<void> {
  const { jobId } = req.params;
  try {
    // Cancel in-memory tracker (sets cancelled flag and aborts controller)
    cancelQAJobInMemory(jobId);
    // Update database status
    await db.updateQAJobProgress(jobId, 0, 'cancelled');
    res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to cancel QA job.';
    res.status(500).json({ success: false, error: message });
  }
}
