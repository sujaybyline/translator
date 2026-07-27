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

export interface PreviewSegment {
  segmentId: string;
  original: string;
  translation: string;
  status: string;
  validationStatus: string;
}

export interface TranslationJob {
  id: string;
  originalFilename: string;
  outputFilename: string | null;
  sourceLanguage: string | null;
  sourceLanguageName: string;
  targetLanguage: string;
  targetLanguageName: string;
  xliffVersion: string | null;
  totalSegments: number;
  translatedSegments: number;
  status: JobStatus;
  errorMessage: string | null;
  fileSize: number | null;
  createdAt: string;
  completedAt: string | null;
  progressPercent: number;
  segments?: PreviewSegment[];
}

export interface PreviewResponse {
  segments: PreviewSegment[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export const TARGET_LANGUAGES = [
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
] as const;

export type AiProvider = 'gemini' | 'anthropic';

export interface AppSettings {
  provider: AiProvider | null;
  model: string | null;
  hasApiKey: boolean;
  api_key: string | null;
}

export interface SaveAppSettingsInput {
  provider: AiProvider;
  model: string;
  api_key?: string;
}

export const AI_PROVIDER_OPTIONS = [
  { value: 'gemini' as const, label: 'Gemini' },
  { value: 'anthropic' as const, label: 'Anthropic' },
];

export const AI_MODEL_OPTIONS: Record<AiProvider, Array<{ value: string; label: string }>> = {
  gemini: [
    { value: 'gemini-2.5-pro', label: 'gemini-2.5-pro' },
    { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
    { value: 'gemini-2.0-flash', label: 'gemini-2.0-flash' },
  ],
  anthropic: [
    { value: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
    { value: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
    { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
    { value: 'claude-opus-4-5-20251101', label: 'Claude Opus 4.5' },
    { value: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  ],
};

// ── QA types ────────────────────────────────────────────────────────────────

export type QASegmentStatus = 'ok' | 'warning' | 'error' | 'missing';

export interface QASegmentResult {
  segmentId: string;
  sourceText: string;
  translatedText: string;
  status: QASegmentStatus;
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
