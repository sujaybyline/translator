import fs from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { parseXliff, isSupportedXliffExtension } from '../parsers/xliffParser.js';
import { detectSourceLanguage, languageCodeToName } from './languageDetection.js';
import { protectPlaceholders } from './placeholderProtection.js';
import { rebuildXliff, rebuildXliffSourceOnly, buildOutputFilename } from './xliffRebuilder.js';
import { validateGeneratedXliff } from '../validators/xliffValidator.js';
import { isQuotaError, userFacingError } from '../translators/geminiTranslator.js';
import { createConfiguredTranslator } from './appSettingsService.js';
import { backupTranslatedFile, removeFiles } from './fileStorage.js';
import {
  resolveTargetLanguage,
  SUPPORTED_TARGET_LANGUAGES,
  type JobStatus,
  type ProtectedSegment,
  type TranslatableSegment,
  type TranslationResultItem,
  type XliffVersion,
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
  sourceOnlyOutputPath: string | null;
  fileSize: number | null;
  createdAt: string;
  completedAt: string | null;
  progressPercent: number;
  segments: PreviewSegment[];
  rawXml?: string;
  parseSegments?: TranslatableSegment[];
}

const memoryJobs = new Map<string, JobState>();
const cancellationRequests = new Set<string>();
const pipelinePromises = new Map<string, Promise<void>>();
const pipelineControllers = new Map<string, AbortController>();

function publicJob(job: JobState) {
  // Never expose internal file system paths in API responses
  const { rawXml: _r, parseSegments: _p, uploadPath: _u, outputPath: _o, ...rest } = job;
  return rest;
}

async function persistJob(job: JobState): Promise<void> {
  memoryJobs.set(job.id, job);
  await db.updateJob(job.id, {
    output_filename: job.outputFilename,
    source_language: job.sourceLanguage,
    target_language: job.targetLanguage,
    xliff_version: job.xliffVersion,
    total_segments: job.totalSegments,
    translated_segments: job.translatedSegments,
    status: ['translating', 'parsing', 'preparing', 'detecting_language', 'validating', 'rebuilding'].includes(job.status)
      ? 'processing'
      : job.status,
    error_message: job.errorMessage,
    output_path: job.outputPath,
    source_only_output_path: job.sourceOnlyOutputPath ?? null,
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
    targetLanguageName:
      SUPPORTED_TARGET_LANGUAGES[
        config.defaultTargetLanguage as keyof typeof SUPPORTED_TARGET_LANGUAGES
      ]?.name ?? config.defaultTargetLanguage,
    xliffVersion: parsed.version,
    totalSegments: parsed.segments.length,
    translatedSegments: 0,
    status: 'uploaded',
    errorMessage: null,
    uploadPath: file.path,
    outputPath: null,
    sourceOnlyOutputPath: null,
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
    uploadPath: null,   // intentionally omitted from public response
    outputPath: null,   // intentionally omitted from public response
    sourceOnlyOutputPath: null,
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
          ?.name ?? languageCodeToName(row.target_language),
      xliffVersion: (row.xliff_version as XliffVersion | null) ?? null,
      totalSegments: row.total_segments,
      translatedSegments: row.translated_segments,
      status: row.status as JobStatus,
      errorMessage: row.error_message,
      uploadPath: null,   // intentionally omitted from public response
      outputPath: null,   // intentionally omitted from public response
      sourceOnlyOutputPath: null,
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

export async function startTranslation(
  jobId: string,
  targetLanguageCode?: string,
): Promise<JobState> {
  let job = memoryJobs.get(jobId);
  if (!job) {
    const row = await db.getJobById(jobId);
    if (!row) {
      throw new Error('Translation job not found. Please upload the file again.');
    }
    if (row.status !== 'uploaded') {
      throw new Error('This job cannot be started in its current state. Please upload the file again.');
    }
    if (!row.upload_path) {
      throw new Error('Upload file is no longer available. Please upload the file again.');
    }
    let xml: string;
    try {
      xml = await fs.readFile(row.upload_path, 'utf8');
    } catch {
      throw new Error('Upload file is no longer available on disk. Please upload the file again.');
    }
    const parsed = parseXliff(xml);
    const lang = detectSourceLanguage(
      row.source_language,
      parsed.segments.map((s) => s.sourceText),
    );
    job = {
      id: row.id,
      originalFilename: row.original_filename,
      outputFilename: row.output_filename,
      sourceLanguage: lang.code,
      sourceLanguageName: lang.name,
      targetLanguage: row.target_language,
      targetLanguageName:
        SUPPORTED_TARGET_LANGUAGES[row.target_language as keyof typeof SUPPORTED_TARGET_LANGUAGES]
          ?.name ?? row.target_language,
      xliffVersion: (row.xliff_version as XliffVersion) ?? parsed.version,
      totalSegments: parsed.segments.length,
      translatedSegments: 0,
      status: 'uploaded',
      errorMessage: null,
      uploadPath: row.upload_path,
      outputPath: null,
      sourceOnlyOutputPath: null,
      fileSize: row.file_size,
      createdAt: new Date(row.created_at).toISOString(),
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
    memoryJobs.set(job.id, job);
  }

  // After the if(!job) block TypeScript needs a concrete type — assert it here
  const resolvedJob = job as JobState;

  if (resolvedJob.status !== 'uploaded') {
    return publicJob(resolvedJob) as JobState;
  }

  const target = resolveTargetLanguage(targetLanguageCode ?? config.defaultTargetLanguage);
  resolvedJob.targetLanguage = target.code;
  resolvedJob.targetLanguageName = target.name;

  resolvedJob.status = 'preparing';
  await persistJob(resolvedJob);
  const controller = new AbortController();
  pipelineControllers.set(jobId, controller);
  const pipeline = runTranslationPipeline(jobId, controller.signal);
  pipelinePromises.set(jobId, pipeline);
  void pipeline.then(
    () => {
      pipelinePromises.delete(jobId);
      pipelineControllers.delete(jobId);
    },
    () => {
      pipelinePromises.delete(jobId);
      pipelineControllers.delete(jobId);
    },
  );
  return publicJob(resolvedJob) as JobState;
}

export async function clearJob(jobId: string): Promise<boolean> {
  const job = memoryJobs.get(jobId);
  if (!job) {
    // Job only in DB (e.g. after server restart)
    const persistedJob = await db.getJobById(jobId);
    if (!persistedJob) return false;
    await db.deleteJob(jobId);
    await removeJobFiles(
      persistedJob.upload_path,
      persistedJob.output_path,
      persistedJob.source_only_output_path,
    );
    return true;
  }

  // Cancel pipeline if still running — allow clearing completed/failed jobs too
  if (job.status !== 'uploaded' && job.status !== 'failed' && job.status !== 'completed') {
    if (!pipelinePromises.has(jobId)) return false;
    cancellationRequests.add(jobId);
    pipelineControllers.get(jobId)?.abort();
    await pipelinePromises.get(jobId);
    // Ensure the flag is cleaned up even if the pipeline finished before the abort landed
    cancellationRequests.delete(jobId);
  }
  const currentJob = memoryJobs.get(jobId);
  if (!currentJob) return true;
  memoryJobs.delete(jobId);
  await db.deleteJob(jobId);
  await removeJobFiles(
    currentJob.uploadPath,
    currentJob.outputPath,
    currentJob.sourceOnlyOutputPath,
  );
  return true;
}

async function removeJobFiles(...filePaths: Array<string | null | undefined>): Promise<void> {
  await removeFiles(...filePaths);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function throwIfCancellationRequested(jobId: string): void {
  if (cancellationRequests.has(jobId)) {
    throw new Error('Translation cancelled.');
  }
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

async function runTranslationPipeline(jobId: string, signal: AbortSignal): Promise<void> {
  const job = memoryJobs.get(jobId);
  if (!job || !job.rawXml || !job.parseSegments) return;

  try {
    job.status = 'parsing';
    job.progressPercent = 5;
    await persistJob(job);
    throwIfCancellationRequested(jobId);

    job.status = 'detecting_language';
    job.progressPercent = 10;
    await persistJob(job);
    throwIfCancellationRequested(jobId);

    job.status = 'preparing';
    job.progressPercent = 15;
    await persistJob(job);
    throwIfCancellationRequested(jobId);

    const protectedSegments: ProtectedSegment[] = job.parseSegments.map((s) => {
      const { protectedText, tokenMap } = protectPlaceholders(s.sourceText);
      return { id: s.id, protectedText, tokenMap };
    });

    job.status = 'translating';
    await persistJob(job);

    const translator = await createConfiguredTranslator(signal);
    const allResults: TranslationResultItem[] = [];
    let quotaHit = false;

    const CONCURRENT_BATCHES = 4;

    // Pre-build all batches upfront
    const batches: ProtectedSegment[][] = [];
    for (let i = 0; i < protectedSegments.length; ) {
      const batchSize = computeBatchSize(protectedSegments, i, config.batchSize);
      batches.push(protectedSegments.slice(i, i + batchSize));
      i += batchSize;
    }

    // Process batches in parallel groups of CONCURRENT_BATCHES
    for (let g = 0; g < batches.length; g += CONCURRENT_BATCHES) {
      throwIfCancellationRequested(jobId);

      const group = batches.slice(g, g + CONCURRENT_BATCHES);
      const groupResults = await Promise.all(
        group.map((batch) => translator.translateBatch(batch, job.targetLanguageName)),
      );
      throwIfCancellationRequested(jobId);

      for (const results of groupResults) {
        allResults.push(...results);
        if (results.some((r) => r.error && isQuotaError(new Error(r.error)))) {
          quotaHit = true;
        }
        if (quotaHit && results.every((r) => r.status === 'failed')) {
          throw new Error(
            userFacingError(new Error(results.find((r) => r.error)?.error ?? 'API quota exceeded')),
          );
        }
      }

      const processedCount = Math.min((g + CONCURRENT_BATCHES), batches.length);
      job.translatedSegments = allResults.filter((r) => r.status === 'translated').length;
      job.progressPercent = Math.min(
        90,
        Math.round((processedCount / batches.length) * 80) + 15,
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
      throwIfCancellationRequested(jobId);

      // Delay between parallel groups (not between every batch)
      if (g + CONCURRENT_BATCHES < batches.length) {
        await sleep(1000);
        throwIfCancellationRequested(jobId);
      }
    }

    job.status = 'validating';
    job.progressPercent = 92;
    await persistJob(job);
    throwIfCancellationRequested(jobId);

    const successful = allResults.filter(
      (r) => r.status === 'translated' && r.translatedText.length > 0,
    );
    if (successful.length === 0) {
      throw new Error('All translation batches failed. Please try again.');
    }

    job.status = 'rebuilding';
    job.progressPercent = 95;
    await persistJob(job);
    throwIfCancellationRequested(jobId);

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
    await backupTranslatedFile(outputPath, `${job.id}_${outputFilename}`);
    throwIfCancellationRequested(jobId);

    const sourceOnlyContent = rebuildXliffSourceOnly({
      rawXml: job.rawXml,
      version: job.xliffVersion ?? '1.2',
      translations: successful.map((r) => ({ id: r.id, translatedText: r.translatedText })),
      targetLanguageCode: job.targetLanguage,
    });
    // Derive source-only filename from the bilingual filename — avoids 'Unknown' language names
    const soExt = outputFilename.match(/\.(xlf|xliff)$/i)?.[0] ?? '.xliff';
    const soBase = outputFilename.replace(/\.(xlf|xliff)$/i, '');
    const sourceOnlyFilename = `${soBase}_source${soExt}`;
    const sourceOnlyPath = path.join(config.paths.output, `${job.id}_${sourceOnlyFilename}`);
    await fs.writeFile(sourceOnlyPath, sourceOnlyContent, 'utf8');
    throwIfCancellationRequested(jobId);

    job.outputFilename = outputFilename;
    job.outputPath = outputPath;
    job.sourceOnlyOutputPath = sourceOnlyPath;
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
    throwIfCancellationRequested(jobId);
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
    if (cancellationRequests.has(jobId)) {
      cancellationRequests.delete(jobId);
      memoryJobs.delete(jobId);
      await db.deleteJob(jobId);
      await removeJobFiles(job.uploadPath, job.outputPath);
      return;
    }
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
  // Use raw in-memory job first so we have the real outputPath (not stripped by publicJob)
  const rawJob = memoryJobs.get(jobId);
  if (rawJob && rawJob.status === 'completed' && rawJob.outputPath) {
    try {
      await fs.access(rawJob.outputPath);
      return {
        filePath: rawJob.outputPath,
        filename: rawJob.outputFilename ?? path.basename(rawJob.outputPath),
      };
    } catch {
      // File missing — fall through to reconstruction
    }
  }

  // Fall back to DB lookup + path reconstruction
  const job = rawJob ?? (await getJobAsync(jobId));
  if (!job || job.status !== 'completed') return null;

  if (job.outputFilename) {
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

/**
 * Serve the source-replaced XLIFF from disk.
 * The file is written during the pipeline and its path is persisted in the DB,
 * so this works correctly after server restarts.
 */
export async function getDownloadSourceContent(
  jobId: string,
): Promise<{ filePath: string; filename: string } | null> {
  const job = memoryJobs.get(jobId) ?? (await getJobAsync(jobId));
  if (!job || job.status !== 'completed') return null;

  // Primary: use the stored path
  if (job.sourceOnlyOutputPath) {
    try {
      await fs.access(job.sourceOnlyOutputPath);
      const filename = path.basename(job.sourceOnlyOutputPath).replace(/^[^_]+_/, '');
      return { filePath: job.sourceOnlyOutputPath, filename };
    } catch {
      // File missing — fall through to path reconstruction below
    }
  }

  // Fallback: reconstruct path from outputFilename convention (covers jobs translated
  // before sourceOnlyOutputPath was added, where it may be null in DB)
  if (job.outputFilename) {
    // Derive the source-only filename from the bilingual outputFilename by inserting '_source'
    // e.g. myfile_de.xlf  →  myfile_de_source.xlf
    // This avoids depending on sourceLanguageName (which can be 'Unknown').
    const ext = job.outputFilename.match(/\.(xlf|xliff)$/i)?.[0] ?? '.xliff';
    const base = job.outputFilename.replace(/\.(xlf|xliff)$/i, '');
    const sourceOnlyFilename = `${base}_source${ext}`;
    const candidate = path.join(config.paths.output, `${jobId}_${sourceOnlyFilename}`);
    try {
      await fs.access(candidate);
      return { filePath: candidate, filename: sourceOnlyFilename };
    } catch {
      // Also try the old naming convention in case the file was written before this fix
      const legacyFilename = `${job.sourceLanguageName}_to_${job.targetLanguageName}.xliff`;
      const legacyCandidate = path.join(config.paths.output, `${jobId}_${legacyFilename}`);
      try {
        await fs.access(legacyCandidate);
        return { filePath: legacyCandidate, filename: legacyFilename };
      } catch {
        return null;
      }
    }
  }

  return null;
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

  if (db.isDatabaseAvailable()) {
    const rows = await db.getSegmentsByJobId(jobId);
    if (rows.length > 0) {
      segments = rows.map((s) => ({
        segmentId: s.segment_identifier,
        original: s.source_text,
        translation: s.translated_text ?? '',
        status: s.status,
        validationStatus: s.validation_status,
      }));
    } else if (job.parseSegments && job.parseSegments.length > 0) {
      // Job is uploaded but not yet translated — segments only exist in memory
      segments = job.parseSegments.map((s) => ({
        segmentId: s.id,
        original: s.sourceText,
        translation: '',
        status: 'pending',
        validationStatus: 'pending',
      }));
    }
  } else if ((!segments || segments.length === 0) && job.parseSegments) {
    // No DB — fall back to parsed segments so uploaded jobs show source text
    segments = job.parseSegments.map((s) => ({
      segmentId: s.id,
      original: s.sourceText,
      translation: '',
      status: 'pending',
      validationStatus: 'pending',
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

export async function updateSegmentTranslation(
  jobId: string,
  segmentId: string,
  newTranslation: string,
): Promise<PreviewSegment | null> {
  const job = memoryJobs.get(jobId);
  if (db.isDatabaseAvailable()) {
    const sourceText =
      job?.segments.find((s) => s.segmentId === segmentId)?.original ?? '';
    await db.updateSegmentTranslation(jobId, segmentId, newTranslation, sourceText);
  }
  if (!job) {
    // Job not in memory - load from DB and return updated segment
    const dbJob = await db.getJobById(jobId);
    if (!dbJob) return null;
    
    const rows = await db.getSegmentsByJobId(jobId);
    const updated = rows.find((s) => s.segment_identifier === segmentId);
    if (!updated) return null;
    
    return {
      segmentId: updated.segment_identifier,
      original: updated.source_text,
      translation: newTranslation,
      status: 'pending',
      validationStatus: 'pending',
    };
  }

  // Update in memory
  const segment = job.segments.find((s) => s.segmentId === segmentId);
  if (!segment) return null;

  segment.translation = newTranslation;
  segment.status = 'pending';
  segment.validationStatus = 'pending';

  // Rebuild output file with updated translations
  if (job.status === 'completed' && job.rawXml && job.parseSegments && job.outputFilename) {
    try {
      const translations = job.segments.map((s) => ({
        id: s.segmentId,
        translatedText: s.translation,
      }));

      const rebuilt = rebuildXliff({
        rawXml: job.rawXml,
        version: job.xliffVersion ?? '1.2',
        translations,
        targetLanguageCode: job.targetLanguage,
      });

      const outputPath = path.join(config.paths.output, `${job.id}_${job.outputFilename}`);
      await fs.writeFile(outputPath, rebuilt, 'utf8');

      // Also rebuild source-only version using stable filename (avoids 'Unknown' language names)
      const sourceOnlyContent = rebuildXliffSourceOnly({
        rawXml: job.rawXml,
        version: job.xliffVersion ?? '1.2',
        translations,
        targetLanguageCode: job.targetLanguage,
      });
      const soExt2 = job.outputFilename.match(/\.(xlf|xliff)$/i)?.[0] ?? '.xliff';
      const soBase2 = job.outputFilename.replace(/\.(xlf|xliff)$/i, '');
      const sourceOnlyFilename = `${soBase2}_source${soExt2}`;
      const sourceOnlyPath = path.join(config.paths.output, `${job.id}_${sourceOnlyFilename}`);
      await fs.writeFile(sourceOnlyPath, sourceOnlyContent, 'utf8');
    } catch (err) {
      console.error('Failed to rebuild output file after edit:', err);
    }
  }

  return segment;
}
