import { Check, XCircle } from 'lucide-react';
import type { TranslationJob } from '../types';
import { statusLabel } from '../utils/format';

interface Props {
  job: TranslationJob;
}

const STEPS = [
  { key: 'parsing',            label: 'Parsing' },
  { key: 'detecting_language', label: 'Detecting language' },
  { key: 'preparing',          label: 'Preparing' },
  { key: 'translating',        label: 'Translating' },
  { key: 'validating',         label: 'Validating' },
  { key: 'rebuilding',         label: 'Rebuilding' },
] as const;

const STEP_ORDER = STEPS.map((s) => s.key);

function stepIndex(status: string): number {
  const i = STEP_ORDER.indexOf(status as (typeof STEP_ORDER)[number]);
  return i === -1 ? (status === 'completed' ? STEP_ORDER.length : -1) : i;
}

export function ProgressPanel({ job }: Props) {
  const percent = Math.min(100, Math.max(0, job.progressPercent ?? 0));
  const active = !['uploaded', 'completed', 'failed'].includes(job.status);
  const currentStep = stepIndex(job.status);

  if (!active && job.status !== 'failed') return null;

  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-white/90 shadow-sm overflow-hidden">
      {/* progress bar at top */}
      <div className="h-1.5 w-full bg-[var(--color-paper-2)]">
        <div
          className={[
            'h-full rounded-full transition-all duration-700 ease-out',
            job.status === 'failed'
              ? 'bg-[var(--color-danger)]'
              : 'bg-[linear-gradient(90deg,var(--color-brand),var(--color-accent))]',
          ].join(' ')}
          style={{ width: `${job.status === 'failed' ? 100 : percent}%` }}
        />
      </div>

      <div className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-[var(--color-ink)]">
              {job.status === 'failed' ? 'Translation failed' : 'Translating your file…'}
            </p>
            <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
              {statusLabel(job.status)}
              {job.totalSegments > 0 && (
                <>
                  {' · '}
                  <span className="font-medium text-[var(--color-ok)]">{job.translatedSegments}</span>
                  {' done · '}
                  {job.totalSegments - job.translatedSegments}
                  {' pending · '}
                  <span className="font-medium">{percent}%</span>
                </>
              )}
            </p>
          </div>
          {active && (
            <span className="relative flex h-3 w-3 mt-1 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-accent)] opacity-60" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-[var(--color-accent)]" />
            </span>
          )}
        </div>

        {/* step pills */}
        {active && (
          <div className="mt-5 flex flex-wrap gap-2">
            {STEPS.map((step, i) => {
              const done = i < currentStep;
              const current = i === currentStep;
              return (
                <span
                  key={step.key}
                  className={[
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all',
                    done
                      ? 'bg-[color-mix(in_oklab,var(--color-ok)_14%,white)] text-[var(--color-ok)]'
                      : current
                        ? 'bg-[color-mix(in_oklab,var(--color-brand)_12%,white)] text-[var(--color-brand)] ring-1 ring-[var(--color-brand)]/30'
                        : 'bg-[var(--color-paper-2)] text-[var(--color-ink-soft)]/60',
                  ].join(' ')}
                >
                  {done ? (
                    <Check size={11} strokeWidth={2.5} aria-hidden />
                  ) : current ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" aria-hidden />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-40" aria-hidden />
                  )}
                  {step.label}
                </span>
              );
            })}
          </div>
        )}

        {job.errorMessage && (
          <div className="mt-4 flex gap-3 rounded-xl bg-[color-mix(in_oklab,var(--color-danger)_8%,white)] border border-[color-mix(in_oklab,var(--color-danger)_20%,white)] px-4 py-3">
            <XCircle size={16} className="shrink-0 mt-0.5 text-[var(--color-danger)]" aria-hidden />
            <p className="text-sm text-[var(--color-danger)]">{job.errorMessage}</p>
          </div>
        )}
      </div>
    </div>
  );
}
