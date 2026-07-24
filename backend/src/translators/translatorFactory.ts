import { GeminiTranslator } from './geminiTranslator.js';
import { AnthropicTranslator } from './anthropicTranslator.js';
import type { AiProvider, Translator, TranslatorConfig } from './types.js';

export function createTranslator(
  config: TranslatorConfig,
  signal?: AbortSignal,
): Translator {
  switch (config.provider) {
    case 'gemini':
      return new GeminiTranslator(config.apiKey, config.model, signal);
    case 'anthropic':
      return new AnthropicTranslator(config.apiKey, config.model, signal);
    default: {
      const unknown = config.provider as string;
      throw new Error(`Unsupported AI provider: ${unknown}`);
    }
  }
}

export function isAiProvider(value: string): value is AiProvider {
  return value === 'gemini' || value === 'anthropic';
}
