import { string } from "zod/v4";

export type JobStatus =
  | 'uploaded'
  | 'uploading'
  | 'parsing'
  | 'detecting_language'
  | 'preparing'
  | 'translating'
  | 'validating'
  | 'rebuilding'
  | 'completed'
  | 'failed'
  | 'processing';

export type SegmentValidationStatus = 'pending' | 'valid' | 'needs_review' | 'failed';
export type SegmentStatus = 'pending' | 'translated' | 'failed' | 'skipped';

export type XliffVersion = '1.2' | '2.0' | 'unknown';

/** Supported target languages for translation output. */
export const SUPPORTED_TARGET_LANGUAGES = {
  de: { code: 'de', name: 'German', nativeName: 'Deutsch' },
  sl: { code: 'sl', name: 'Slovenian', nativeName: 'Slovenščina' },
  pl: { code: 'pl', name: 'Polish', nativeName: 'Polski' },
  es: { code: 'es', name: 'Spanish', nativeName: 'Español' },
  fr: { code: 'fr', name: 'French', nativeName: 'Français' },
  'zh-cn': { code: 'zh-cn', name: 'Chinese (Simplified)', nativeName: '简体中文' },
  ja: { code: 'ja', name: 'Japanese', nativeName: '日本語' },
} as const;

export type TargetLanguageCode = keyof typeof SUPPORTED_TARGET_LANGUAGES;

export function isSupportedTargetLanguage(code: string): code is TargetLanguageCode {
  return code in SUPPORTED_TARGET_LANGUAGES;
}

export function resolveTargetLanguage(code: string): {
  code: TargetLanguageCode;
  name: string;
  nativeName: string;
} {
  const normalized = code.trim().toLowerCase();
  if (!isSupportedTargetLanguage(normalized)) {
    throw new Error(
      `Unsupported target language "${code}". Supported: ${Object.keys(SUPPORTED_TARGET_LANGUAGES).join(', ')}`,
    );
  }
  return SUPPORTED_TARGET_LANGUAGES[normalized];
}

export interface TranslatableSegment {
  id: string;
  /** Path used to locate the node when writing back */
  locator: string;
  sourceText: string;
  targetText?: string;
  hasExistingTarget: boolean;
}

export interface XliffParseResult {
  version: XliffVersion;
  sourceLanguage: string | null;
  targetLanguage: string | null;
  segments: TranslatableSegment[];
  rawXml: string;
}

export interface ProtectedSegment {
  id: string;
  protectedText: string;
  tokenMap: Record<string, string>;
}

export interface TranslationResultItem {
  id: string;
  translatedText: string;
  validationStatus: SegmentValidationStatus;
  status: SegmentStatus;
  error?: string;
}

export interface TranslationJobRecord {
  id: string;
  original_filename: string;
  output_filename: string | null;
  source_language: string | null;
  target_language: string;
  xliff_version: string | null;
  total_segments: number;
  translated_segments: number;
  status: string;
  error_message: string | null;
  upload_path: string | null;
  output_path: string | null;
  source_only_output_path: string | null;
  file_size: number | null;
  created_at: Date;
  completed_at: Date | null;
}


export interface TranslationSegmentRecord {
  id: number;
  translation_job_id: string;
  segment_identifier: string;
  source_text: string;
  translated_text: string | null;
  validation_status: string;
  status: string;
  sort_order: number;
}
