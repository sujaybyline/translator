import { getAppSettings } from '../db/pool.js';
import { createTranslator } from '../translators/translatorFactory.js';
import type { AiProvider, Translator, TranslatorConfig } from '../translators/types.js';

export interface PublicAppSettings {
  provider: AiProvider | null;
  model: string | null;
  hasApiKey: boolean;
  /** First 4 + last 4 characters of the key with the middle masked — safe to display. */
  maskedApiKey: string | null;
}

/** Mask a key to show only the first 4 and last 4 characters. */
function maskKey(key: string): string {
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 4)}${'•'.repeat(Math.min(key.length - 8, 20))}${key.slice(-4)}`;
}

export async function getPublicAppSettings(): Promise<PublicAppSettings> {
  const settings = await getAppSettings();
  if (!settings) {
    return { provider: null, model: null, hasApiKey: false, maskedApiKey: null };
  }

  const apiKey = settings.api_key?.trim() || null;

  return {
    provider: settings.provider,
    model: settings.model,
    hasApiKey: Boolean(apiKey),
    maskedApiKey: apiKey ? maskKey(apiKey) : null,
  };
}

export async function loadTranslatorConfig(): Promise<TranslatorConfig> {
  const settings = await getAppSettings();
  if (!settings) {
    throw new Error(
      'AI provider is not configured. Open Settings and save a provider, model, and API key.',
    );
  }
  if (!settings.api_key?.trim()) {
    throw new Error('AI API key is not configured. Open Settings and save an API key.');
  }

  return {
    provider: settings.provider,
    model: settings.model,
    apiKey: settings.api_key,
  };
}

export async function createConfiguredTranslator(signal?: AbortSignal): Promise<Translator> {
  const config = await loadTranslatorConfig();
  return createTranslator(config, signal);
}
