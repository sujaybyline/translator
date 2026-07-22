import fs from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { parseXliff, isSupportedXliffExtension } from '../parsers/xliffParser.js';
import { detectSourceLanguage, languageCodeToName } from './languageDetection.js';
import { protectPlaceholders } from './placeholderProtection.js';
import { rebuildXliff, buildOutputFilename } from './xliffRebuilder.js';
import { validateGeneratedXliff } from '../validators/xliffValidator.js';
import { GeminiTranslator, isQuotaError, userFacingError } from '../translators/geminiTranslator.js';
import { SUPPORTED_TARGET_LANGUAGES } from '../types/index.js';
import type {
  JobStatus,
  ProtectedSegment,
  TranslatableSegment,
  TranslationResultItem,
  XliffVersion,
} from '../types/index.js';
import * as db from '../db/pool.js';

export interface PreviewSegment {
  segmentId: string;
  original: string;
  translation: string;
  status: string;
  validationStatus: string;
}

export interface JobState {
  id: string;
  originalFilename: string;
  outputFilename: string | null;
  sourceLanguage: string | null;
  sourceLanguageName: string;
  targetLanguage: string;
  targetLanguageName: string;
  xliffVersion: XliffVersion | null;
  totalSegments: number;
  translatedSegments: number;
  status: JobStatus;
  errorMessage: string | null;
  uploadPath: string | null;
  outputPath: string | null;
  fileSize: number | null;
  createdAt: string;
  completedAt: string | null;
  progressPercent: number;
  segments: PreviewSegment[];
  rawXml?: string;
  parseSegments?: TranslatableSegment[];
}

const memoryJobs = new Map<string, JobState>();

function publicJob(job: JobState) {
  const { rawXml: _r, parseSegments: _p, ...rest } = job;
  return rest;
}

async function persistJob(job: JobState): Promise<void> {
  memoryJobs.set(job.id, job);
  await db.updateJob(job.id, {
    output_filename: job.outputFilename,
    source_language: job.sourceLanguage,
    xliff_version: job.xliffVersion,
    total_segments: job.totalSegments,
    translated_segments: job.translatedSegments,
    status: job.status === 'translating' || job.status === 'parsing' || job.status === 'preparing'
      ? 'processing'
      : job.status,
    error_message: job.errorMessage,
    output_path: job.outputPath,
    completed_at: job.completedAt ? new Date(job.completedAt) : null,
  });
}

export async function createJobFromUpload(file: {
  originalname: string;
  path: string;
  size: number;
}): Promise<JobState> {
  if (!isSupportedXliffExtension(file.originalname)) {
    await fs.unlink(file.path).catch(() => undefined);
    throw new Error('Unsupported file type. Please upload a .xlf or .xliff file.');
  }

  const xml = await fs.readFile(file.path, 'utf8');
  const parsed = parseXliff(xml);
  const lang = detectSourceLanguage(
    parsed.sourceLanguage,
    parsed.segments.map((s) => s.sourceText),
  );

  const id = uuidv4();
  const job: JobState = {
    id,
    originalFilename: file.originalname,
    outputFilename: null,
    sourceLanguage: lang.code,
    sourceLanguageName: lang.name,
    targetLanguage: config.defaultTargetLanguage,
    targetLanguageName: SUPPORTED_TARGET_LANGUAGES.de.name,
    xliffVersion: parsed.version,
    totalSegments: parsed.segments.length,
    translatedSegments: 0,
    status: 'uploaded',
    errorMessage: null,
    uploadPath: file.path,
    outputPath: null,
    fileSize: file.size,
    createdAt: new Date().toISOString(),
    completedAt: null,
    progressPercent: 0,
    segments: parsed.segments.map((s) => ({
      segmentId: s.id,
      original: s.sourceText,
      translation: '',
      status: 'pending',
      validationStatus: 'pending',
    })),
    rawXml: parsed.rawXml,
    parseSegments: parsed.segments,
  };

  memoryJobs.set(id, job);
  await db.insertJob({
    id,
    original_filename: job.originalFilename,
    source_language: job.sourceLanguage,
    target_language: job.targetLanguage,
    xliff_version: job.xliffVersion,
    total_segments: job.totalSegments,
    status: 'uploaded',
    upload_path: job.uploadPath,
    file_size: job.fileSize,
  });

  return publicJob(job) as JobState;
}

export function getJob(jobId: string): JobState | null {
  const job = memoryJobs.get(jobId);
  if (!job) return null;
  return publicJob(job) as JobState;
}

export async function getJobAsync(jobId: string): Promise<JobState | null> {
  const mem = memoryJobs.get(jobId);
  if (mem) return publicJob(mem) as JobState;

  const row = await db.getJobById(jobId);
  if (!row) return null;

  const segs = await db.getSegmentsByJobId(jobId);
  return {
    id: row.id,
    originalFilename: row.original_filename,
    outputFilename: row.output_filename,
    sourceLanguage: row.source_language,
    sourceLanguageName: languageCodeToName(row.source_language),
    targetLanguage: row.target_language,
    targetLanguageName:
      SUPPORTED_TARGET_LANGUAGES[row.target_language as keyof typeof SUPPORTED_TARGET_LANGUAGES]
        ?.name ?? row.target_language,
    xliffVersion: (row.xliff_version as XliffVersion) ?? null,
    totalSegments: row.total_segments,
    translatedSegments: row.translated_segments,
    status: row.status as JobStatus,
    errorMessage: row.error_message,
    uploadPath: row.upload_path,
    outputPath: row.output_path,
    fileSize: row.file_size,
    createdAt: new Date(row.created_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    progressPercent:
      row.total_segments > 0
        ? Math.round((row.translated_segments / row.total_segments) * 100)
        : row.status === 'completed'
          ? 100
          : 0,
    segments: segs.map((s) => ({
      segmentId: s.segment_identifier,
      original: s.source_text,
      translation: s.translated_text ?? '',
      status: s.status,
      validationStatus: s.validation_status,
    })),
  };
}

export async function listHistory(): Promise<JobState[]> {
  const fromDb = await db.listJobs(200);
  if (fromDb.length > 0) {
    return fromDb.map((row) => ({
      id: row.id,
      originalFilename: row.original_filename,
      outputFilename: row.output_filename,
      sourceLanguage: row.source_language,
      sourceLanguageName: languageCodeToName(row.source_language),
      targetLanguage: row.target_language,
      targetLanguageName:
        SUPPORTED_TARGET_LANGUAGES[row.target_language as keyof typeof SUPPORTED_TARGET_LANGUAGES]
          ?.name ?? 'German',
      xliffVersion: (row.xliff_version as XliffVersion | null) ?? null,
      totalSegments: row.total_segments,
      translatedSegments: row.translated_segments,
      status: row.status as JobStatus,
      errorMessage: row.error_message,
      uploadPath: row.upload_path,
      outputPath: row.output_path,
      fileSize: row.file_size,
      createdAt: new Date(row.created_at).toISOString(),
      completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
      progressPercent:
        row.status === 'completed'
          ? 100
          : row.total_segments > 0
            ? Math.round((row.translated_segments / row.total_segments) * 100)
            : 0,
      segments: [] as PreviewSegment[],
    }));
  }

  return [...memoryJobs.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((j) => publicJob(j) as JobState);
}

export async function startTranslation(jobId: string): Promise<JobState> {
  const job = memoryJobs.get(jobId);
  if (!job) {
    throw new Error('Translation job not found. Please upload the file again.');
  }
  if (job.status === 'translating' || job.status === 'processing') {
    return publicJob(job) as JobState;
  }
  if (job.status === 'completed') {
    return publicJob(job) as JobState;
  }

  void runTranslationPipeline(jobId);
  job.status = 'preparing';
  await persistJob(job);
  return publicJob(job) as JobState;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeBatchSize(
  segments: ProtectedSegment[],
  start: number,
  maxBatch: number,
): number {
  let size = 0;
  let chars = 0;
  const charLimit = 12_000;

  while (start + size < segments.length && size < maxBatch) {
    const next = segments[start + size].protectedText.length;
    if (size > 0 && chars + next > charLimit) break;
    chars += next;
    size += 1;
  }

  return Math.max(1, size);
}

async function runTranslationPipeline(jobId: string): Promise<void> {
  const job = memoryJobs.get(jobId);
  if (!job || !job.rawXml || !job.parseSegments) return;

  try {
    job.status = 'parsing';
    job.progressPercent = 5;
    await persistJob(job);

    job.status = 'detecting_language';
    job.progressPercent = 10;
    await persistJob(job);

    job.status = 'preparing';
    job.progressPercent = 15;
    await persistJob(job);

    const protectedSegments: ProtectedSegment[] = job.parseSegments.map((s) => {
      const { protectedText, tokenMap } = protectPlaceholders(s.sourceText);
      return { id: s.id, protectedText, tokenMap };
    });

    job.status = 'translating';
    await persistJob(job);

    const translator = new GeminiTranslator();
    const allResults: TranslationResultItem[] = [];
    let quotaHit = false;

    for (let i = 0; i < protectedSegments.length; ) {
      const batchSize = computeBatchSize(protectedSegments, i, config.batchSize);
      const batch = protectedSegments.slice(i, i + batchSize);
      const results = await translator.translateBatch(batch, job.targetLanguageName);
      allResults.push(...results);

      if (results.some((r) => r.error && isQuotaError(new Error(r.error)))) {
        quotaHit = true;
      }

      job.translatedSegments = allResults.filter((r) => r.status === 'translated').length;
      job.progressPercent = Math.min(
        90,
        Math.round(((i + batch.length) / protectedSegments.length) * 80) + 15,
      );
      job.segments = job.parseSegments.map((s) => {
        const r = allResults.find((x) => x.id === s.id);
        return {
          segmentId: s.id,
          original: s.sourceText,
          translation: r?.translatedText ?? '',
          status: r?.status ?? 'pending',
          validationStatus: r?.validationStatus ?? 'pending',
        };
      });
      await persistJob(job);

      i += batch.length;

      if (i < protectedSegments.length) {
        await sleep(config.batchDelayMs);
      }

      if (quotaHit && results.every((r) => r.status === 'failed')) {
        throw new Error(
          userFacingError(new Error(results.find((r) => r.error)?.error ?? 'Gemini quota exceeded')),
        );
      }
    }

    job.status = 'validating';
    job.progressPercent = 92;
    await persistJob(job);

    const successful = allResults.filter(
      (r) => r.status === 'translated' && r.translatedText.length > 0,
    );
    if (successful.length === 0) {
      throw new Error('All translation batches failed. Please try again.');
    }

    job.status = 'rebuilding';
    job.progressPercent = 95;
    await persistJob(job);

    const rebuilt = rebuildXliff({
      rawXml: job.rawXml,
      version: job.xliffVersion ?? '1.2',
      translations: successful.map((r) => ({
        id: r.id,
        translatedText: r.translatedText,
      })),
      targetLanguageCode: job.targetLanguage,
    });

    const validation = validateGeneratedXliff(rebuilt);
    if (!validation.valid) {
      throw new Error(
        `Generated XLIFF failed validation: ${validation.errors.join('; ')}`,
      );
    }

    const outputFilename = buildOutputFilename(job.originalFilename, job.targetLanguage);
    const outputPath = path.join(config.paths.output, `${job.id}_${outputFilename}`);
    await fs.mkdir(config.paths.output, { recursive: true });
    await fs.writeFile(outputPath, rebuilt, 'utf8');

    job.outputFilename = outputFilename;
    job.outputPath = outputPath;
    job.translatedSegments = successful.length;
    job.status = 'completed';
    job.progressPercent = 100;
    job.completedAt = new Date().toISOString();
    job.segments = job.parseSegments.map((s) => {
      const r = allResults.find((x) => x.id === s.id);
      return {
        segmentId: s.id,
        original: s.sourceText,
        translation: r?.translatedText ?? '',
        status: r?.status ?? 'failed',
        validationStatus: r?.validationStatus ?? 'failed',
      };
    });

    await persistJob(job);
    await db.replaceSegments(
      job.id,
      job.segments.map((s, idx) => ({
        segment_identifier: s.segmentId,
        source_text: s.original,
        translated_text: s.translation,
        validation_status: s.validationStatus,
        status: s.status,
        sort_order: idx,
      })),
    );

    // Cleanup upload after success
    if (job.uploadPath) {
      await fs.unlink(job.uploadPath).catch(() => undefined);
    }
  } catch (err) {
    job.status = 'failed';
    job.errorMessage =
      err instanceof Error ? err.message : 'Translation failed due to an unexpected error.';
    job.progressPercent = 0;
    await persistJob(job);
    console.error(`[job ${jobId}]`, err);
  }
}

export async function getDownloadPath(
  jobId: string,
): Promise<{ filePath: string; filename: string } | null> {
  const job = memoryJobs.get(jobId) ?? (await getJobAsync(jobId));
  if (!job || job.status !== 'completed' || !job.outputPath) {
    // Try reconstructing path from DB fields
    if (job?.outputFilename) {
      const candidate = path.join(config.paths.output, `${jobId}_${job.outputFilename}`);
      try {
        await fs.access(candidate);
        return { filePath: candidate, filename: job.outputFilename };
      } catch {
        return null;
      }
    }
    return null;
  }
  try {
    await fs.access(job.outputPath);
    return {
      filePath: job.outputPath,
      filename: job.outputFilename ?? path.basename(job.outputPath),
    };
  } catch {
    return null;
  }
}

export async function getPreview(
  jobId: string,
  options: { q?: string; page?: number; pageSize?: number } = {},
): Promise<{
  segments: PreviewSegment[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const job = memoryJobs.get(jobId) ?? (await getJobAsync(jobId));
  if (!job) throw new Error('Job not found');

  let segments = job.segments;
  if ((!segments || segments.length === 0) && db.isDatabaseAvailable()) {
    const rows = await db.getSegmentsByJobId(jobId);
    segments = rows.map((s) => ({
      segmentId: s.segment_identifier,
      original: s.source_text,
      translation: s.translated_text ?? '',
      status: s.status,
      validationStatus: s.validation_status,
    }));
  }

  const q = options.q?.trim().toLowerCase();
  if (q) {
    segments = segments.filter(
      (s) =>
        s.segmentId.toLowerCase().includes(q) ||
        s.original.toLowerCase().includes(q) ||
        s.translation.toLowerCase().includes(q),
    );
  }

  const pageSize = Math.min(Math.max(options.pageSize ?? 20, 1), 100);
  const page = Math.max(options.page ?? 1, 1);
  const total = segments.length;
  const start = (page - 1) * pageSize;

  return {
    segments: segments.slice(start, start + pageSize),
    total,
    page,
    pageSize,
  };
}
