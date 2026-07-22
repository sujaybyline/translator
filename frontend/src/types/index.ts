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
