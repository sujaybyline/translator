import type { TranslationJob } from '../types';
import { statusLabel } from '../utils/format';

interface Props {
  job: TranslationJob;
}

export function ProgressPanel({ job }: Props) {
  const percent = Math.min(100, Math.max(0, job.progressPercent ?? 0));
  const active = !['uploaded', 'completed', 'failed'].includes(job.status);

  if (!active && job.status !== 'failed') return null;

  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-white/80 p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--color-ink)]">
            {job.status === 'failed' ? 'Translation failed' : 'Translating…'}
          </p>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            {statusLabel(job.status)}
            {job.totalSegments > 0 && (
              <>
                {' '}
                · {job.translatedSegments} translated · {job.totalSegments - job.translatedSegments} failed/pending · {percent}%
              </>
            )}
          </p>
        </div>
        {active && (
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-accent)] opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-[var(--color-accent)]" />
          </span>
        )}
      </div>

      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[var(--color-paper-2)]">
        <div
          className={[
            'h-full rounded-full transition-all duration-500 ease-out',
            job.status === 'failed' ? 'bg-[var(--color-danger)]' : 'bg-[var(--color-brand)]',
          ].join(' ')}
          style={{ width: `${job.status === 'failed' ? 100 : percent}%` }}
        />
      </div>

      {job.errorMessage && (
        <p className="mt-4 rounded-lg bg-[color-mix(in_oklab,var(--color-danger)_10%,white)] px-3 py-2 text-sm text-[var(--color-danger)]">
          {job.errorMessage}
        </p>
      )}
    </div>
  );
}
