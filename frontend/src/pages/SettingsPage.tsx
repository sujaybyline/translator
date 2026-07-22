import { useEffect, useState } from 'react';
import { getHealth } from '../services/api';

export function SettingsPage() {
  const [health, setHealth] = useState<{
    status: string;
    geminiConfigured: boolean;
    database: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load settings'));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-[var(--color-brand)]">
          Settings
        </h1>
        <p className="mt-2 text-[var(--color-ink-soft)]">
          Basic service configuration for version 1.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--color-line)] bg-white/80 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--color-ink)]">Translation defaults</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <Item label="Source language" value="Automatically detected" />
          <Item label="Target language" value="German (fixed in v1)" />
          <Item label="Supported XLIFF versions" value="1.2 and 2.0" />
          <Item label="Batch size" value="Configured via TRANSLATION_BATCH_SIZE" />
        </dl>
      </div>

      <div className="rounded-2xl border border-[var(--color-line)] bg-white/80 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--color-ink)]">Service health</h2>
        {error && (
          <p className="mt-3 text-sm text-[var(--color-danger)]">{error}</p>
        )}
        {health && (
          <dl className="mt-4 grid gap-4 sm:grid-cols-3">
            <Item label="API" value={health.status} />
            <Item
              label="Gemini API key"
              value={health.geminiConfigured ? 'Configured' : 'Missing — set GEMINI_API_KEY in .env'}
            />
            <Item label="MySQL" value={health.database} />
          </dl>
        )}
        <p className="mt-5 text-sm text-[var(--color-ink-soft)]">
          Secrets such as <code className="rounded bg-[var(--color-paper-2)] px-1">GEMINI_API_KEY</code> are
          stored only on the backend in <code className="rounded bg-[var(--color-paper-2)] px-1">.env</code>.
          Never put API keys in the React app.
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
