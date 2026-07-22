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

/** Supported target languages — V1 uses German only; extend this map later. */
export const SUPPORTED_TARGET_LANGUAGES = {
  de: { code: 'de', name: 'German', nativeName: 'Deutsch' },
} as const;

export type TargetLanguageCode = keyof typeof SUPPORTED_TARGET_LANGUAGES;

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
