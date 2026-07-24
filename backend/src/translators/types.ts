import type { ProtectedSegment, TranslationResultItem } from '../types/index.js';

export type AiProvider = 'gemini' | 'anthropic';

export interface Translator {
  translateBatch(
    segments: ProtectedSegment[],
    targetLanguageName?: string,
  ): Promise<TranslationResultItem[]>;
}

export interface TranslatorConfig {
  provider: AiProvider;
  model: string;
  apiKey: string;
}
