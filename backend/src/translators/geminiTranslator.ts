import { GoogleGenerativeAI } from '@google/generative-ai';
import { config, assertGeminiConfigured } from '../config.js';
import type { ProtectedSegment, TranslationResultItem } from '../types/index.js';
import {
  hasTranslatableText,
  restorePlaceholders,
  validatePlaceholderIntegrity,
} from '../services/placeholderProtection.js';

const MODEL_FALLBACKS = [
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-flash-8b',
];

function buildPrompt(
  items: Array<{ id: string; text: string }>,
  targetLanguageName: string,
  strict: boolean,
): string {
  const strictExtra = strict
    ? `
STRICT MODE:
- You MUST preserve every __PH_N__ token character-for-character.
- Do not translate, reorder, drop, or invent tokens.`
    : '';

  return `You are a professional localization engine.
Translate the provided source text into ${targetLanguageName}.

Rules:
1. Translate only human-readable natural language between __PH_N__ tokens.
2. Preserve all __PH_N__ tokens exactly as they appear.
3. Never modify URLs, variable names, or technical identifiers.
4. Return only valid JSON — no Markdown, no explanations.
${strictExtra}

Return: {"translations":[{"id":"<id>","text":"<translated text>"}]}

Segments:
${JSON.stringify(items)}`;
}

function stripCodeFences(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  return cleaned.trim();
}

function parseGeminiJson(raw: string): Array<{ id: string; text: string }> {
  const cleaned = stripCodeFences(raw);

  try {
    const parsed = JSON.parse(cleaned) as {
      translations?: Array<{ id: string; text: string }>;
    };
    if (Array.isArray(parsed.translations)) {
      return parsed.translations.map((t) => ({
        id: String(t.id),
        text: String(t.text ?? ''),
      }));
    }
  } catch {
    // fall through
  }

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
      translations?: Array<{ id: string; text: string }>;
    };
    if (Array.isArray(parsed.translations)) {
      return parsed.translations.map((t) => ({
        id: String(t.id),
        text: String(t.text ?? ''),
      }));
    }
  }

  throw new Error('Failed to parse Gemini translation response as JSON.');
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isRateLimitError(err: unknown): boolean {
  return /429|rate.?limit|quota|resource.?exhausted|too many requests/i.test(errorMessage(err));
}

function isQuotaError(err: unknown): boolean {
  return /quota|billing|exceeded your current/i.test(errorMessage(err));
}

function userFacingError(err: unknown): string {
  const msg = errorMessage(err);
  if (isQuotaError(err)) {
    return 'Gemini API quota exceeded. Wait a few minutes or check billing at https://ai.google.dev/gemini-api/docs/rate-limits';
  }
  if (isRateLimitError(err)) {
    return 'Gemini rate limit reached. The job will retry automatically — please wait.';
  }
  return msg.slice(0, 300);
}

export class GeminiTranslator {
  private genAI: GoogleGenerativeAI;
  private models: string[];

  constructor() {
    assertGeminiConfigured();
    this.genAI = new GoogleGenerativeAI(config.geminiApiKey);
    const primary = config.geminiModel;
    this.models = [primary, ...MODEL_FALLBACKS.filter((m) => m !== primary)];
  }

  private getModel(modelName: string) {
    return this.genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    });
  }

  private async callModel(prompt: string): Promise<string> {
    let lastError: unknown;

    for (const modelName of this.models) {
      for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
        try {
          const result = await this.getModel(modelName).generateContent(prompt);
          return result.response.text();
        } catch (err) {
          lastError = err;
          console.warn(`[gemini] ${modelName} attempt ${attempt}:`, errorMessage(err).slice(0, 120));

          if (isRateLimitError(err)) {
            await sleep(Math.min(60_000, 2000 * attempt * attempt));
            continue;
          }
          if (attempt < config.maxRetries) {
            await sleep(800 * attempt);
            continue;
          }
          break; // try next model
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Gemini API request failed.');
  }

  async translateBatch(
    segments: ProtectedSegment[],
    targetLanguageName = 'German',
  ): Promise<TranslationResultItem[]> {
    if (segments.length === 0) return [];

    const results: TranslationResultItem[] = [];
    const toTranslate: ProtectedSegment[] = [];

    for (const segment of segments) {
      if (!hasTranslatableText(segment.protectedText)) {
        results.push({
          id: segment.id,
          translatedText: restorePlaceholders(segment.protectedText, segment.tokenMap),
          validationStatus: 'valid',
          status: 'translated',
        });
        continue;
      }
      toTranslate.push(segment);
    }

    if (toTranslate.length === 0) return results;

    const items = toTranslate.map((s) => ({ id: s.id, text: s.protectedText }));
    const byId = new Map(toTranslate.map((s) => [s.id, s]));

    let translations: Array<{ id: string; text: string }>;
    try {
      const raw = await this.callModel(buildPrompt(items, targetLanguageName, false));
      translations = parseGeminiJson(raw);
    } catch (err) {
      try {
        await sleep(3000);
        const raw = await this.callModel(buildPrompt(items.slice(0, 5), targetLanguageName, true));
        translations = parseGeminiJson(raw);
        if (items.length > 5) {
          throw err; // partial retry not enough — surface error
        }
      } catch (retryErr) {
        const message = userFacingError(retryErr);
        return [
          ...results,
          ...toTranslate.map((s) => ({
            id: s.id,
            translatedText: '',
            validationStatus: 'failed' as const,
            status: 'failed' as const,
            error: message,
          })),
        ];
      }
    }

    const resultMap = new Map(translations.map((t) => [t.id, t.text]));

    for (const segment of toTranslate) {
      const rawTranslated = resultMap.get(segment.id);
      if (rawTranslated == null) {
        results.push({
          id: segment.id,
          translatedText: '',
          validationStatus: 'needs_review',
          status: 'failed',
          error: 'Missing translation in Gemini response',
        });
        continue;
      }

      const integrity = validatePlaceholderIntegrity(segment.protectedText, rawTranslated);

      if (!integrity.ok) {
        try {
          const retryRaw = await this.callModel(
            buildPrompt([{ id: segment.id, text: segment.protectedText }], targetLanguageName, true),
          );
          const retryParsed = parseGeminiJson(retryRaw);
          const retryText = retryParsed.find((t) => t.id === segment.id)?.text;
          if (retryText != null) {
            const retryIntegrity = validatePlaceholderIntegrity(segment.protectedText, retryText);
            if (retryIntegrity.ok) {
              results.push({
                id: segment.id,
                translatedText: restorePlaceholders(retryText, segment.tokenMap),
                validationStatus: 'valid',
                status: 'translated',
              });
              continue;
            }
          }
        } catch {
          // fall through
        }

        results.push({
          id: segment.id,
          translatedText: restorePlaceholders(rawTranslated, segment.tokenMap),
          validationStatus: 'needs_review',
          status: 'translated',
          error: integrity.reason,
        });
        continue;
      }

      results.push({
        id: segment.id,
        translatedText: restorePlaceholders(rawTranslated, segment.tokenMap),
        validationStatus: 'valid',
        status: 'translated',
      });
    }

    for (const segment of toTranslate) {
      if (!results.find((r) => r.id === segment.id)) {
        const original = byId.get(segment.id);
        results.push({
          id: segment.id,
          translatedText: original?.protectedText
            ? restorePlaceholders(original.protectedText, original.tokenMap)
            : '',
          validationStatus: 'needs_review',
          status: 'failed',
          error: 'No result produced',
        });
      }
    }

    return results;
  }
}

export { isQuotaError, userFacingError };
