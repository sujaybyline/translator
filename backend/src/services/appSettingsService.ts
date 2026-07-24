import { getAppSettings } from '../db/pool.js';
import { createTranslator } from '../translators/translatorFactory.js';
import type { AiProvider, Translator, TranslatorConfig } from '../translators/types.js';

export interface PublicAppSettings {
  provider: AiProvider | null;
  model: string | null;
  hasApiKey: boolean;
  api_key: string | null;
}

export async function getPublicAppSettings(): Promise<PublicAppSettings> {
  const settings = await getAppSettings();
  if (!settings) {
    return { provider: null, model: null, hasApiKey: false, api_key: null };
  }

  const apiKey = settings.api_key?.trim() || null;

  return {
    provider: settings.provider,
    model: settings.model,
    hasApiKey: Boolean(apiKey),
    api_key: apiKey,
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
