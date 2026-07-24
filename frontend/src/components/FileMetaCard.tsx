import type { TranslationJob } from '../types';
import { TARGET_LANGUAGES } from '../types';
import { useEffect, useState } from 'react';
import { formatBytes, statusLabel } from '../utils/format';

interface Props {
  job: TranslationJob;
  onStart: (targetLanguage: string) => void;
  onClear: () => void;
  starting?: boolean;
  clearing?: boolean;
}

export function FileMetaCard({ job, onStart, onClear, starting, clearing }: Props) {
  const [targetLanguage, setTargetLanguage] = useState(job.targetLanguage || 'de');
  const ready = job.status === 'uploaded';
  const busy = [
    'parsing',
    'detecting_language',
    'preparing',
    'translating',
    'validating',
    'rebuilding',
    'processing',
  ].includes(job.status);
  const cancellable = busy;

  useEffect(() => {
    if (job.targetLanguage) {
      setTargetLanguage(job.targetLanguage);
    }
  }, [job.targetLanguage]);

  const selectedLanguageName =
    TARGET_LANGUAGES.find((lang) => lang.code === targetLanguage)?.name ??
    job.targetLanguageName ??
    'Unknown';

  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-white/80 p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-soft)]">
            Uploaded file
          </p>
          <h2 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--color-brand)]">
            {job.originalFilename}
          </h2>
        </div>
        <span className="rounded-full bg-[var(--color-paper-2)] px-3 py-1 text-xs font-medium text-[var(--color-brand)]">
          {statusLabel(job.status)}
        </span>
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Meta label="File size" value={formatBytes(job.fileSize)} />
        <Meta label="XLIFF version" value={job.xliffVersion ?? '—'} />
        <Meta label="Translation units" value={String(job.totalSegments)} />
        <Meta label="Source language" value={job.sourceLanguageName || 'Auto Detect'} />
        <div className="rounded-xl bg-[var(--color-paper)]/80 px-4 py-3">
          <label className="text-xs text-[var(--color-ink-soft)]">Target language</label>
          {ready ? (
            <select
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
              className="mt-2 w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-base font-semibold text-[var(--color-ink)] focus:border-[var(--color-brand)] focus:outline-none"
            >
              {TARGET_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="mt-2 text-base font-semibold text-[var(--color-ink)]">
              {job.targetLanguageName || selectedLanguageName}
            </p>
          )}
        </div>

        <Meta
          label="Direction"
          value={`${job.sourceLanguageName || 'Auto Detect'} → ${ready ? selectedLanguageName : job.targetLanguageName || selectedLanguageName}`}
        />
      </dl>

      {ready && (
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => onStart(targetLanguage)}
            disabled={starting || clearing}
            aria-busy={starting}
            className="w-full rounded-xl bg-[var(--color-brand)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-light)] disabled:opacity-60 sm:w-auto"
          >
            {starting ? (
              <span className="inline-flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                />
                Starting…
              </span>
            ) : (
              'Start Translation'
            )}
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={starting || clearing}
            className="w-full rounded-xl border border-[var(--color-line)] px-5 py-3 text-sm font-semibold text-[var(--color-ink-soft)] transition hover:bg-[var(--color-paper)] disabled:opacity-60 sm:w-auto"
          >
            {clearing ? 'Clearing…' : 'Clear Upload'}
          </button>
        </div>
      )}

      {!ready && cancellable && (
        <button
          type="button"
          onClick={onClear}
          disabled={clearing}
          className="mt-6 rounded-xl border border-[var(--color-line)] px-5 py-3 text-sm font-semibold text-[var(--color-ink-soft)] transition hover:bg-[var(--color-paper)] disabled:opacity-60"
        >
          {clearing ? 'Cancelling…' : 'Cancel Processing'}
        </button>
      )}

      {busy && (
        <p className="mt-4 text-sm text-[var(--color-ink-soft)]">
          Translation is in progress. You can watch the status below.
        </p>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--color-paper)]/80 px-4 py-3">
      <dt className="text-xs text-[var(--color-ink-soft)]">{label}</dt>
      <dd className="mt-1 text-base font-semibold text-[var(--color-ink)]">{value}</dd>
    </div>
  );
}
