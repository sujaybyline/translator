/**
 * QA Service — two modes:
 * 1. runQAComparison       — compare two edited/translated XLIFF files segment by segment
 * 2. runQASingleFileReview — review a single translated/bilingual XLIFF for quality
 *
 * Both functions accept an optional onBatch callback that is called after each
 * AI batch completes, enabling SSE streaming in the controller.
 */

import fs from 'node:fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { parseXliff } from '../parsers/xliffParser.js';
import * as db from '../db/pool.js';

// ── In-memory job tracker for immediate cancellation ───────────────────────

interface ActiveQAJob {
  id: string;
  cancelled: boolean;
  controller: AbortController;
}

const activeJobs = new Map<string, ActiveQAJob>();

export function registerQAJob(jobId: string, controller: AbortController): void {
  activeJobs.set(jobId, { id: jobId, cancelled: false, controller });
}

export function cancelQAJobInMemory(jobId: string): void {
  const job = activeJobs.get(jobId);
  if (job) {
    job.cancelled = true;
    job.controller.abort();
    // Remove immediately to prevent any further work
    activeJobs.delete(jobId);
  }
}

export function cancelAllQAJobsInMemory(): void {
  for (const [jobId, job] of activeJobs.entries()) {
    job.cancelled = true;
    job.controller.abort();
  }
  // Clear all jobs immediately
  activeJobs.clear();
}

export function isJobCancelled(jobId: string): boolean {
  const job = activeJobs.get(jobId);
  return job?.cancelled ?? false;
}

export function removeQAJob(jobId: string): void {
  activeJobs.delete(jobId);
}

export interface QASegmentResult {
  segmentId: string;
  sourceText: string;
  translatedText: string;
  status: 'ok' | 'warning' | 'error' | 'missing';
  suggestion: string;
}

export interface QAResult {
  sourceFilename: string;
  translatedFilename: string;
  totalSegments: number;
  okCount: number;
  warningCount: number;
  errorCount: number;
  missingCount: number;
  segments: QASegmentResult[];
}

/** Emitted after each batch — controller streams these immediately to the client */
export interface QABatchEvent {
  segments: QASegmentResult[];
  reviewedSoFar: number;
  totalToReview: number;
}

export type OnBatchFn = (event: QABatchEvent) => void;

// ── XML helpers ───────────────────────────────────────────────────────────────

function stripXmlTags(text: string): string {
  return text
    .replace(/<(bpt|ept|ph|x|it|bx|ex|cp|sc|ec)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(bpt|ept|ph|x|it|bx|ex|cp|sc|ec)\b[^>]*\/>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

// ── AI helpers ────────────────────────────────────────────────────────────────

function stripCodeFences(text: string): string {
  let s = text.trim();
  if (s.startsWith('```')) s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  return s.trim();
}

function parseQAJson(
  raw: string,
): Array<{ id: string; status: 'ok' | 'warning' | 'error'; suggestion: string }> {
  const cleaned = stripCodeFences(raw);
  try {
    const parsed = JSON.parse(cleaned) as {
      results?: Array<{ id: string; status: string; suggestion: string }>;
    };
    if (Array.isArray(parsed.results)) {
      return parsed.results.map((r) => ({
        id: String(r.id),
        status: (['ok', 'warning', 'error'].includes(r.status) ? r.status : 'warning') as
          | 'ok'
          | 'warning'
          | 'error',
        suggestion: String(r.suggestion ?? ''),
      }));
    }
  } catch {
    // fall through
  }
  throw new Error('Failed to parse QA response from AI.');
}

async function callAI(
  prompt: string,
  cfg: { provider: string; model: string; apiKey: string },
  signal?: AbortSignal,
): Promise<string> {
  if (cfg.provider === 'gemini') {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(cfg.apiKey);
    const model = genAI.getGenerativeModel({
      model: cfg.model,
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
    });
    const result = await model.generateContent(prompt, { signal });
    return result.response.text();
  } else {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: cfg.apiKey });
    const response = await client.messages.create({
      model: cfg.model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('');
  }
}

// ── Prompts ───────────────────────────────────────────────────────────────────

function buildComparePrompt(
  pairs: Array<{ id: string; versionA: string; versionB: string }>,
  targetLanguageName: string,
): string {
  return `You are a professional translation quality assurance reviewer.

You are given pairs of translated segments in ${targetLanguageName} from two different versions of the same XLIFF file.
Compare Version A and Version B for each segment and assess consistency, accuracy, and quality differences.

Rules for status:
- "ok"      — both versions are equivalent in meaning and quality, or only minor style differences
- "warning" — noticeable differences in phrasing, terminology, or register that should be reviewed
- "error"   — significant inconsistency: different meaning, one version is clearly wrong, or contradictory translations

"suggestion" — briefly describe the difference and recommend which version to keep. If status is "ok", write "Both versions are consistent."

Return ONLY valid JSON:
{"results":[{"id":"<id>","status":"ok|warning|error","suggestion":"<text>"}]}

Segment pairs:
${JSON.stringify(pairs)}`;
}

function buildReviewPrompt(
  items: Array<{ id: string; text: string }>,
  targetLanguageName: string,
): string {
  return `You are a professional translation quality assurance reviewer.

You are given text segments that should all be written in ${targetLanguageName}.
Review each segment:
- Is it actually in ${targetLanguageName}?
- Is it grammatically correct and natural?
- Are there untranslated words, garbled content, or obvious errors?

Rules for status:
- "ok"      — correct, natural ${targetLanguageName}
- "warning" — minor grammar issues, slightly unnatural phrasing, mixed language
- "error"   — wrong language, serious grammar error, untranslated source text, or garbled content

"suggestion" — brief specific note (1–2 sentences). If status is "ok", write "Looks good."

Return ONLY valid JSON:
{"results":[{"id":"<id>","status":"ok|warning|error","suggestion":"<text>"}]}

Segments:
${JSON.stringify(items)}`;
}

// ── Compare two translated XLIFF files ────────────────────────────────────────

export async function runQAComparison(
  fileAPath: string,
  fileAName: string,
  fileBPath: string,
  fileBName: string,
  targetLanguageName: string,
  onBatch?: OnBatchFn,
  signal?: AbortSignal,
  qaJobId?: string,
): Promise<QAResult> {
  // Cancel any existing running QA jobs before starting a new one
  await db.cancelAllRunningQAJobs();
  cancelAllQAJobsInMemory();

  const [xmlA, xmlB] = await Promise.all([
    fs.readFile(fileAPath, 'utf8'),
    fs.readFile(fileBPath, 'utf8'),
  ]);

  const parsedA = parseXliff(xmlA);
  const parsedB = parseXliff(xmlB);
  const mapB = new Map(parsedB.segments.map((s) => [s.id, s]));

  // Create or use provided QA job ID
  const jobId = qaJobId || uuidv4();
  const totalSegments = parsedA.segments.length + parsedB.segments.length;

  // Create AbortController for this job
  const jobController = new AbortController();
  const jobSignal = signal ? AbortSignal.any([signal, jobController.signal]) : jobController.signal;

  // Register job in memory tracker
  registerQAJob(jobId, jobController);

  // Create QA job record in database
  await db.createQAJob({
    id: jobId,
    mode: 'compare',
    source_filename: fileAName,
    translated_filename: fileBName,
    target_language: targetLanguageName,
    total_segments: totalSegments,
  });

  // Check cancellation after database write
  if (isJobCancelled(jobId) || jobSignal.aborted) {
    removeQAJob(jobId);
    throw new Error('QA cancelled.');
  }

  // Pre-resolved segments (no AI needed)
  const resolved: QASegmentResult[] = [];
  const toReview: Array<{ id: string; versionA: string; versionB: string }> = [];

  for (const segA of parsedA.segments) {
    const textA = stripXmlTags(segA.targetText ?? segA.sourceText);
    const segB = mapB.get(segA.id);

    if (!segB) {
      const seg = { segmentId: segA.id, sourceText: textA, translatedText: '', status: 'missing' as const, suggestion: `Segment not found in ${fileBName}.` };
      resolved.push(seg);
      continue;
    }

    const textB = stripXmlTags(segB.targetText ?? segB.sourceText);

    if (!textA && !textB) {
      const seg = { segmentId: segA.id, sourceText: textA, translatedText: textB, status: 'ok' as const, suggestion: 'No translatable text — skipped.' };
      resolved.push(seg);
      continue;
    }

    if (textA === textB) {
      const seg = { segmentId: segA.id, sourceText: textA, translatedText: textB, status: 'ok' as const, suggestion: 'Both versions are identical.' };
      resolved.push(seg);
      continue;
    }

    toReview.push({ id: segA.id, versionA: textA, versionB: textB });
  }

  // Segments in B missing from A
  for (const segB of parsedB.segments) {
    if (!parsedA.segments.some((s) => s.id === segB.id)) {
      const seg = { segmentId: segB.id, sourceText: '', translatedText: stripXmlTags(segB.targetText ?? segB.sourceText), status: 'missing' as const, suggestion: `Segment exists in ${fileBName} but not in ${fileAName}.` };
      resolved.push(seg);
    }
  }

  // Save resolved segments to database
  if (resolved.length > 0) {
      await db.insertQASegments(
      jobId,
      resolved.map((s) => ({
        segment_id: s.segmentId,
        source_text: s.sourceText,
        translated_text: s.translatedText,
        status: s.status,
        suggestion: s.suggestion,
      })),
    );
      
    // Check cancellation after database write
      if (isJobCancelled(jobId) || jobSignal.aborted) {
        removeQAJob(jobId);
      throw new Error('QA cancelled.');
    }
  }

  const BATCH_SIZE = 20;
  const { loadTranslatorConfig } = await import('./appSettingsService.js');
  const cfg = await loadTranslatorConfig();

  // Check cancellation after config load
  if (isJobCancelled(jobId) || jobSignal.aborted) {
    removeQAJob(jobId);
    throw new Error('QA cancelled.');
  }

  const aiSegments: QASegmentResult[] = [];
  let reviewedSoFar = resolved.length;
  const totalToReview = toReview.length + resolved.length;

  try {
    for (let i = 0; i < toReview.length; i += BATCH_SIZE) {
      // Check cancellation flag before processing each batch
      if (isJobCancelled(jobId) || jobSignal.aborted) {
            await db.updateQAJobProgress(jobId, reviewedSoFar, 'cancelled');
        removeQAJob(jobId);
        throw new Error('QA cancelled.');
      }

      const batch = toReview.slice(i, i + BATCH_SIZE);
        const raw = await callAI(buildComparePrompt(batch, targetLanguageName), cfg, jobSignal);
        
      // Check cancellation after AI call
          if (isJobCancelled(jobId) || jobSignal.aborted) {
            removeQAJob(jobId);
        throw new Error('QA cancelled.');
      }
      
      const aiResults = parseQAJson(raw);
  
      const batchSegments: QASegmentResult[] = batch.map((item) => {
        const segB = mapB.get(item.id)!;
        const r = aiResults.find((x) => x.id === item.id);
        return {
          segmentId: item.id,
          sourceText: item.versionA,
          translatedText: stripXmlTags(segB.targetText ?? segB.sourceText),
          status: r?.status ?? 'warning',
          suggestion: r?.suggestion ?? 'Could not retrieve AI review for this segment.',
        };
      });

      aiSegments.push(...batchSegments);
      reviewedSoFar += batchSegments.length;
        
      // Save batch segments to database
          await db.insertQASegments(
        jobId,
        batchSegments.map((s) => ({
          segment_id: s.segmentId,
          source_text: s.sourceText,
          translated_text: s.translatedText,
          status: s.status,
          suggestion: s.suggestion,
        })),
      );
          
      // Check cancellation after database write
          if (isJobCancelled(jobId) || jobSignal.aborted) {
            removeQAJob(jobId);
        throw new Error('QA cancelled.');
      }
      
      // Update job progress
          await db.updateQAJobProgress(jobId, reviewedSoFar);
      
      // Check cancellation after progress update
          if (isJobCancelled(jobId) || jobSignal.aborted) {
            removeQAJob(jobId);
        throw new Error('QA cancelled.');
      }
      
      // Only send progress if job is still active
      if (!isJobCancelled(jobId) && !jobSignal.aborted) {
            onBatch?.({ segments: batchSegments, reviewedSoFar, totalToReview });
      } else {
          }
    }

    // Mark job as completed
      try {
      await db.updateQAJobProgress(jobId, reviewedSoFar, 'completed');
        } catch (err) {
      console.error('Failed to mark QA comparison job as completed:', err);
    }
  } finally {
    // Always remove job from memory
      removeQAJob(jobId);
  }

  const allSegments = [...resolved, ...aiSegments];
  const orderA = new Map(parsedA.segments.map((s, i) => [s.id, i]));
  allSegments.sort((a, b) => (orderA.get(a.segmentId) ?? 999999) - (orderA.get(b.segmentId) ?? 999999));

  return buildResult(fileAName, fileBName, allSegments);
}

// ── Review single translated XLIFF file ───────────────────────────────────────

export async function runQASingleFileReview(
  filePath: string,
  filename: string,
  targetLanguageName: string,
  onBatch?: OnBatchFn,
  signal?: AbortSignal,
  qaJobId?: string,
): Promise<QAResult> {
  // Cancel any existing running QA jobs before starting a new one
  await db.cancelAllRunningQAJobs();
  cancelAllQAJobsInMemory();

  const xml = await fs.readFile(filePath, 'utf8');
  const parsed = parseXliff(xml);

  // Create or use provided QA job ID
  const jobId = qaJobId || uuidv4();
  const totalSegments = parsed.segments.length;

  // Create AbortController for this job
  const jobController = new AbortController();
  const jobSignal = signal ? AbortSignal.any([signal, jobController.signal]) : jobController.signal;

  // Register job in memory tracker
  registerQAJob(jobId, jobController);

  // Create QA job record in database
  await db.createQAJob({
    id: jobId,
    mode: 'review',
    review_filename: filename,
    target_language: targetLanguageName,
    total_segments: totalSegments,
  });

  // Check cancellation after database write
  if (isJobCancelled(jobId) || jobSignal.aborted) {
    removeQAJob(jobId);
    throw new Error('QA cancelled.');
  }

  const resolved: QASegmentResult[] = [];
  const toReview: Array<{ id: string; text: string }> = [];

  for (const seg of parsed.segments) {
    const rawText = seg.targetText ?? seg.sourceText;
    const text = stripXmlTags(rawText);
    if (!text) {
      const segResult = { segmentId: seg.id, sourceText: '', translatedText: '', status: 'ok' as const, suggestion: 'No translatable text — skipped.' };
      resolved.push(segResult);
      continue;
    }
    toReview.push({ id: seg.id, text });
  }

  // Save resolved segments to database
  if (resolved.length > 0) {
    await db.insertQASegments(
      jobId,
      resolved.map((s) => ({
        segment_id: s.segmentId,
        source_text: s.sourceText,
        translated_text: s.translatedText,
        status: s.status,
        suggestion: s.suggestion,
      })),
    );
    
    // Check cancellation after database write
    if (isJobCancelled(jobId) || jobSignal.aborted) {
      removeQAJob(jobId);
      throw new Error('QA cancelled.');
    }
  }

  const BATCH_SIZE = 20;
  const { loadTranslatorConfig } = await import('./appSettingsService.js');
  const cfg = await loadTranslatorConfig();

  // Check cancellation after config load
  if (isJobCancelled(jobId) || jobSignal.aborted) {
    removeQAJob(jobId);
    throw new Error('QA cancelled.');
  }

  const aiSegments: QASegmentResult[] = [];
  let reviewedSoFar = resolved.length;
  const totalToReview = toReview.length + resolved.length;

  try {
    for (let i = 0; i < toReview.length; i += BATCH_SIZE) {
      // Check cancellation flag before processing each batch
      if (isJobCancelled(jobId) || jobSignal.aborted) {
        await db.updateQAJobProgress(jobId, reviewedSoFar, 'cancelled');
        removeQAJob(jobId);
        throw new Error('QA cancelled.');
      }

      const batch = toReview.slice(i, i + BATCH_SIZE);
      const raw = await callAI(buildReviewPrompt(batch, targetLanguageName), cfg, jobSignal);
      
      // Check cancellation after AI call
      if (isJobCancelled(jobId) || jobSignal.aborted) {
        removeQAJob(jobId);
        throw new Error('QA cancelled.');
      }
      
      const aiResults = parseQAJson(raw);

      const batchSegments: QASegmentResult[] = batch.map((item) => {
        const seg = parsed.segments.find((s) => s.id === item.id)!;
        const r = aiResults.find((x) => x.id === item.id);
        return {
          segmentId: item.id,
          sourceText: stripXmlTags(seg.sourceText),
          translatedText: stripXmlTags(seg.targetText ?? seg.sourceText),
          status: r?.status ?? 'warning',
          suggestion: r?.suggestion ?? 'Could not retrieve AI review for this segment.',
        };
      });

      aiSegments.push(...batchSegments);
      reviewedSoFar += batchSegments.length;
      
      // Save batch segments to database
      await db.insertQASegments(
        jobId,
        batchSegments.map((s) => ({
          segment_id: s.segmentId,
          source_text: s.sourceText,
          translated_text: s.translatedText,
          status: s.status,
          suggestion: s.suggestion,
        })),
      );
      
      // Check cancellation after database write
      if (isJobCancelled(jobId) || jobSignal.aborted) {
        removeQAJob(jobId);
        throw new Error('QA cancelled.');
      }
      
      // Update job progress
      await db.updateQAJobProgress(jobId, reviewedSoFar);
      
      // Check cancellation after progress update
      if (isJobCancelled(jobId) || jobSignal.aborted) {
        removeQAJob(jobId);
        throw new Error('QA cancelled.');
      }
      
      // Only send progress if job is still active
      if (!isJobCancelled(jobId) && !jobSignal.aborted) {
        onBatch?.({ segments: batchSegments, reviewedSoFar, totalToReview });
      }
    }

    // Mark job as completed
    try {
      await db.updateQAJobProgress(jobId, reviewedSoFar, 'completed');
    } catch (err) {
      console.error('Failed to mark QA review job as completed:', err);
    }
  } finally {
    // Always remove job from memory
    removeQAJob(jobId);
  }

  const allSegments = [...resolved, ...aiSegments];
  const order = new Map(parsed.segments.map((s, i) => [s.id, i]));
  allSegments.sort((a, b) => (order.get(a.segmentId) ?? 0) - (order.get(b.segmentId) ?? 0));

  return buildResult(filename, filename, allSegments);
}

// ── shared helper ─────────────────────────────────────────────────────────────

function buildResult(sourceFilename: string, translatedFilename: string, segments: QASegmentResult[]): QAResult {
  return {
    sourceFilename,
    translatedFilename,
    totalSegments: segments.length,
    okCount: segments.filter((s) => s.status === 'ok').length,
    warningCount: segments.filter((s) => s.status === 'warning').length,
    errorCount: segments.filter((s) => s.status === 'error').length,
    missingCount: segments.filter((s) => s.status === 'missing').length,
    segments,
  };
}
