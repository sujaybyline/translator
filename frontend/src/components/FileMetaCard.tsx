import type { TranslationJob } from '../types';
import { formatBytes, statusLabel } from '../utils/format';

interface Props {
  job: TranslationJob;
  onStart: () => void;
  starting?: boolean;
}

export function FileMetaCard({ job, onStart, starting }: Props) {
  const ready = job.status === 'uploaded';
  const busy = ['parsing', 'detecting_language', 'preparing', 'translating', 'validating', 'rebuilding', 'processing'].includes(
    job.status,
  );

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
        <Meta label="Target language" value="German" />
        <Meta label="Direction" value="Auto Detect → German" />
      </dl>

      {ready && (
        <button
          type="button"
          onClick={onStart}
          disabled={starting}
          className="mt-6 w-full rounded-xl bg-[var(--color-brand)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-light)] disabled:opacity-60 sm:w-auto"
        >
          {starting ? 'Starting…' : 'Start Translation'}
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
