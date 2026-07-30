import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { getHealth, getSettings, saveSettings } from '../services/api';
import {
  AI_MODEL_OPTIONS,
  AI_PROVIDER_OPTIONS,
  type AiProvider,
  type AppSettings,
} from '../types';

const DEFAULT_PROVIDER: AiProvider = 'gemini';

export function SettingsPage() {
  const [health, setHealth] = useState<{
    status: string;
    database: string;
    provider: string | null;
    model: string | null;
    hasApiKey: boolean;
    aiConfigured: boolean;
  } | null>(null);
  const [savedSettings, setSavedSettings] = useState<AppSettings | null>(null);
  const [provider, setProvider] = useState<AiProvider>(DEFAULT_PROVIDER);
  const [model, setModel] = useState(AI_MODEL_OPTIONS[DEFAULT_PROVIDER][0].value);
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const modelOptions = useMemo(() => {
    const options = [...AI_MODEL_OPTIONS[provider]];
    const savedModel = savedSettings?.provider === provider ? savedSettings.model : null;
    if (savedModel && !options.some((option) => option.value === savedModel)) {
      options.unshift({ value: savedModel, label: `${savedModel} (saved)` });
    }
    return options;
  }, [provider, savedSettings]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([getHealth(), getSettings()])
      .then(([healthData, settingsData]) => {
        if (cancelled) return;

        setHealth(healthData);
        setSavedSettings(settingsData);

        const nextProvider = settingsData.provider ?? DEFAULT_PROVIDER;
        setProvider(nextProvider);

        const options = AI_MODEL_OPTIONS[nextProvider];
        const savedModel = settingsData.model;
        const modelExists = savedModel && options.some((option) => option.value === savedModel);
        setModel(savedModel && (modelExists || settingsData.provider === nextProvider) ? savedModel : options[0].value);
        setApiKey(''); // key is never returned from the server for security
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load settings');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const onProviderChange = (nextProvider: AiProvider) => {
    setProvider(nextProvider);
    setModel(AI_MODEL_OPTIONS[nextProvider][0].value);
    setSuccess(null);
  };

  const onSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const payload: { provider: AiProvider; model: string; api_key?: string } = {
        provider,
        model,
      };

      if (apiKey.trim()) {
        payload.api_key = apiKey.trim();
      } else if (!savedSettings?.hasApiKey) {
        throw new Error('Enter an API key before saving.');
      }

      await saveSettings(payload);
      const [healthData, settingsData] = await Promise.all([getHealth(), getSettings()]);
      setHealth(healthData);
      setSavedSettings(settingsData);
      setApiKey(''); // key is never returned from server for security
      setSuccess('Settings saved. New translations will use this configuration immediately.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-[var(--color-brand)]">
          Settings
        </h1>
        <p className="mt-2 text-[var(--color-ink-soft)]">
          Configure the AI provider, model, and API key used for translations.
        </p>
      </div>

      <form
        onSubmit={onSave}
        className="rounded-2xl border border-[var(--color-line)] bg-white/80 p-6 shadow-sm"
      >
        <h2 className="text-lg font-semibold text-[var(--color-ink)]">AI configuration</h2>
        <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
          Settings are stored in MySQL and applied to every new translation without restarting the
          server.
        </p>

        {loading ? (
          <p className="mt-4 text-sm text-[var(--color-ink-soft)]">Loading settings…</p>
        ) : (
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-[var(--color-ink)]">Provider</span>
              <select
                value={provider}
                onChange={(event) => onProviderChange(event.target.value as AiProvider)}
                className="mt-2 w-full rounded-xl border border-[var(--color-line)] bg-white px-4 py-3 text-sm text-[var(--color-ink)]"
              >
                {AI_PROVIDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-[var(--color-ink)]">Model</span>
              <select
                value={model}
                onChange={(event) => {
                  setModel(event.target.value);
                  setSuccess(null);
                }}
                className="mt-2 w-full rounded-xl border border-[var(--color-line)] bg-white px-4 py-3 text-sm text-[var(--color-ink)]"
              >
                {modelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-[var(--color-ink)]">API key</span>
              <div className="relative mt-2">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(event) => {
                    setApiKey(event.target.value);
                    setSuccess(null);
                  }}
                  placeholder={
                    savedSettings?.maskedApiKey
                      ? `Current: ${savedSettings.maskedApiKey}`
                      : 'sk-… or AIza…'
                  }
                  autoComplete="off"
                  className="w-full rounded-xl border border-[var(--color-line)] bg-white py-3 pl-4 pr-12 text-sm text-[var(--color-ink)]"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((visible) => !visible)}
                  aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-[var(--color-ink-soft)] transition hover:text-[var(--color-ink)]"
                >
                  {showApiKey ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                {savedSettings?.maskedApiKey ? (
                  <span className="flex items-center gap-1.5">
                    <span className="text-[var(--color-ok)]">✓ Key configured:</span>
                    <code className="rounded bg-[var(--color-paper-2)] px-1.5 py-0.5 font-mono text-xs tracking-widest text-[var(--color-ink)]">
                      {savedSettings.maskedApiKey}
                    </code>
                    <span className="text-[var(--color-ink-soft)]/70">— enter a new key above to replace it</span>
                  </span>
                ) : (
                  'No API key saved yet.'
                )}
              </p>
            </label>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-[var(--color-danger)]">{error}</p>}
        {success && <p className="mt-4 text-sm text-[var(--color-ok)]">{success}</p>}

        <button
          type="submit"
          disabled={loading || saving}
          className="mt-6 rounded-xl bg-[var(--color-brand)] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </form>

      <div className="rounded-2xl border border-[var(--color-line)] bg-white/80 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--color-ink)]">Translation defaults</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <Item label="Source language" value="Automatically detected" />
          <Item label="Target language" value="User selected" />
          <Item label="Supported XLIFF versions" value="1.2 and 2.0" />
          <Item label="Batch size" value="Configured via TRANSLATION_BATCH_SIZE" />
        </dl>
      </div>

      <div className="rounded-2xl border border-[var(--color-line)] bg-white/80 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--color-ink)]">Service health</h2>
        {health && (
          <dl className="mt-4 grid gap-4 sm:grid-cols-3">
            <Item label="API" value={health.status} />
            <Item label="MySQL" value={health.database} />
            <Item
              label="AI configuration"
              value={
                health.aiConfigured
                  ? `${health.provider} / ${health.model}`
                  : 'Not configured — save settings above'
              }
            />
          </dl>
        )}
        <p className="mt-5 text-sm text-[var(--color-ink-soft)]">
          API keys are stored in MySQL on the backend. This single-user app displays the saved key
          here so you can review or update it.
        </p>
      </div>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--color-paper)]/80 px-4 py-3">
      <dt className="text-xs text-[var(--color-ink-soft)]">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-[var(--color-ink)]">{value}</dd>
    </div>
  );
}
