import { Play, Trash2, XCircle, FileText } from 'lucide-react';
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
    'parsing', 'detecting_language', 'preparing',
    'translating', 'validating', 'rebuilding', 'processing',
  ].includes(job.status);

  useEffect(() => {
    if (job.targetLanguage) setTargetLanguage(job.targetLanguage);
  }, [job.targetLanguage]);

  const selectedLanguageName =
    TARGET_LANGUAGES.find((l) => l.code === targetLanguage)?.name ??
    job.targetLanguageName ?? 'Unknown';

  const statusColor =
    job.status === 'completed'
      ? 'bg-[color-mix(in_oklab,var(--color-ok)_14%,white)] text-[var(--color-ok)]'
      : job.status === 'failed'
        ? 'bg-[color-mix(in_oklab,var(--color-danger)_14%,white)] text-[var(--color-danger)]'
        : busy
          ? 'bg-[color-mix(in_oklab,var(--color-accent)_18%,white)] text-[var(--color-warn)]'
          : 'bg-[var(--color-paper-2)] text-[var(--color-brand)]';

  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-white/90 shadow-sm overflow-hidden">
      <div className="h-1 w-full bg-[linear-gradient(90deg,var(--color-brand),var(--color-accent))]" />

      <div className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0 grid h-10 w-10 place-items-center rounded-xl bg-[var(--color-paper-2)] text-[var(--color-brand)]">
              <FileText size={20} strokeWidth={1.5} aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-ink-soft)]">Uploaded file</p>
              <h2 className="mt-0.5 font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--color-brand)] truncate">
                {job.originalFilename}
              </h2>
            </div>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${statusColor}`}>
            {statusLabel(job.status)}
          </span>
        </div>

        <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                className="mt-1.5 w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm font-semibold text-[var(--color-ink)] focus:border-[var(--color-brand)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/20"
              >
                {TARGET_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>{lang.name}</option>
                ))}
              </select>
            ) : (
              <p className="mt-1.5 text-sm font-semibold text-[var(--color-ink)]">
                {job.targetLanguageName || selectedLanguageName}
              </p>
            )}
          </div>

          <Meta
            label="Direction"
            value={`${job.sourceLanguageName || 'Auto'} → ${ready ? selectedLanguageName : job.targetLanguageName || selectedLanguageName}`}
          />
        </dl>

        {ready && (
          <div className="mt-5 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => onStart(targetLanguage)}
              disabled={starting || clearing}
              aria-busy={starting}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[var(--color-brand-light)] hover:shadow-md active:scale-95 disabled:opacity-60"
            >
              {starting ? (
                <>
                  <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Starting…
                </>
              ) : (
                <>
                  <Play size={15} aria-hidden />
                  Start Translation
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClear}
              disabled={starting || clearing}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-line)] px-5 py-2.5 text-sm font-semibold text-[var(--color-ink-soft)] transition-all hover:bg-[var(--color-paper)] hover:text-[var(--color-ink)] active:scale-95 disabled:opacity-60"
            >
              <Trash2 size={15} aria-hidden />
              {clearing ? 'Clearing…' : 'Clear Upload'}
            </button>
          </div>
        )}

        {busy && (
          <div className="mt-5 flex items-center justify-between">
            <p className="text-sm text-[var(--color-ink-soft)]">
              Translation is in progress — watch the status below.
            </p>
            <button
              type="button"
              onClick={onClear}
              disabled={clearing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-line)] px-4 py-2 text-sm font-semibold text-[var(--color-ink-soft)] transition-all hover:border-[var(--color-danger)]/50 hover:text-[var(--color-danger)] disabled:opacity-60"
            >
              {clearing ? (
                <>
                  <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                  Cancelling…
                </>
              ) : (
                <>
                  <XCircle size={15} aria-hidden />
                  Cancel
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--color-paper)]/80 px-4 py-3">
      <dt className="text-xs text-[var(--color-ink-soft)]">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-[var(--color-ink)]">{value}</dd>
    </div>
  );
}
