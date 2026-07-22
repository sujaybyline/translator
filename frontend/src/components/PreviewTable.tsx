import { useEffect, useState } from 'react';
import { getDownloadUrl, getPreview } from '../services/api';
import type { PreviewSegment, TranslationJob } from '../types';
import { statusLabel } from '../utils/format';

interface Props {
  job: TranslationJob;
}

export function PreviewTable({ job }: Props) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [segments, setSegments] = useState<PreviewSegment[]>([]);
  const [loading, setLoading] = useState(false);
  const pageSize = 10;

  useEffect(() => {
    let cancelled = false;

    // While translating, use segments already returned by the job poll — no extra preview API calls
    const isActive =
      job.status !== 'completed' &&
      job.status !== 'failed' &&
      job.status !== 'uploaded';

    if (isActive && job.segments && job.segments.length > 0) {
      let rows = job.segments;
      if (q.trim()) {
        const needle = q.trim().toLowerCase();
        rows = rows.filter(
          (s) =>
            s.segmentId.toLowerCase().includes(needle) ||
            s.original.toLowerCase().includes(needle) ||
            s.translation.toLowerCase().includes(needle),
        );
      }
      setTotal(rows.length);
      const start = (page - 1) * pageSize;
      setSegments(rows.slice(start, start + pageSize));
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const data = await getPreview(job.id, { q, page, pageSize });
        if (cancelled) return;
        setSegments(data.segments);
        setTotal(data.total);
      } catch {
        if (!cancelled) {
          setSegments(job.segments ?? []);
          setTotal(job.segments?.length ?? 0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [job.id, job.status, job.segments, q, page]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-white/80 p-6 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-brand)]">
            Translation preview
          </h3>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Read-only review of source segments and German translations.
          </p>
        </div>
        <input
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
          placeholder="Search segments…"
          className="w-full max-w-xs rounded-xl border border-[var(--color-line)] bg-white px-3 py-2 text-sm outline-none ring-[var(--color-brand)] focus:ring-2 sm:w-64"
        />
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-line)] text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
              <th className="px-3 py-2 font-semibold">Segment ID</th>
              <th className="px-3 py-2 font-semibold">Original</th>
              <th className="px-3 py-2 font-semibold">German translation</th>
              <th className="px-3 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-[var(--color-ink-soft)]">
                  Loading preview…
                </td>
              </tr>
            )}
            {!loading && segments.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-[var(--color-ink-soft)]">
                  No segments to display.
                </td>
              </tr>
            )}
            {!loading &&
              segments.map((seg) => (
                <tr key={seg.segmentId} className="border-b border-[var(--color-line)]/70 align-top">
                  <td className="px-3 py-3 font-mono text-xs text-[var(--color-brand)]">
                    {seg.segmentId}
                  </td>
                  <td className="max-w-xs px-3 py-3 text-[var(--color-ink)]">{seg.original}</td>
                  <td className="max-w-xs px-3 py-3 text-[var(--color-ink)]">{seg.translation || '—'}</td>
                  <td className="px-3 py-3">
                    <StatusPill status={seg.validationStatus || seg.status} />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 text-sm text-[var(--color-ink-soft)]">
        <span>
          Page {page} of {totalPages} · {total} segments
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

export function CompletionCard({ job }: { job: TranslationJob }) {
  if (job.status !== 'completed') return null;

  return (
    <div className="rounded-2xl border border-[color-mix(in_oklab,var(--color-ok)_35%,var(--color-line))] bg-[color-mix(in_oklab,var(--color-ok)_6%,white)] p-6 shadow-sm">
      <h3 className="font-[family-name:var(--font-display)] text-3xl text-[var(--color-ok)]">
        Translation Completed
      </h3>
      <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Row label="Original filename" value={job.originalFilename} />
        <Row label="Source language" value={job.sourceLanguageName} />
        <Row label="Target language" value="German" />
        <Row label="XLIFF version" value={job.xliffVersion ?? '—'} />
        <Row label="Total segments" value={String(job.totalSegments)} />
        <Row label="Successfully translated" value={String(job.translatedSegments)} />
        <Row label="Validation status" value="Passed" />
        <Row label="Output file" value={job.outputFilename ?? '—'} />
      </dl>
      <a
        href={getDownloadUrl(job.id)}
        className="mt-6 inline-flex rounded-xl bg-[var(--color-brand)] px-5 py-3 text-sm font-semibold text-white no-underline transition hover:bg-[var(--color-brand-light)]"
      >
        Download German XLIFF
      </a>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[var(--color-ink-soft)]">{label}</dt>
      <dd className="mt-0.5 font-medium text-[var(--color-ink)]">{value}</dd>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'valid' || status === 'translated'
      ? 'bg-[color-mix(in_oklab,var(--color-ok)_14%,white)] text-[var(--color-ok)]'
      : status === 'needs_review'
        ? 'bg-[color-mix(in_oklab,var(--color-warn)_16%,white)] text-[var(--color-warn)]'
        : status === 'failed'
          ? 'bg-[color-mix(in_oklab,var(--color-danger)_14%,white)] text-[var(--color-danger)]'
          : 'bg-[var(--color-paper-2)] text-[var(--color-ink-soft)]';

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>
      {statusLabel(status)}
    </span>
  );
}
