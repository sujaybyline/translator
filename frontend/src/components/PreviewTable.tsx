import { Search, Download, CheckCircle2, X, ArrowLeft, ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getDownloadUrl, getDownloadSourceUrl, getPreview } from '../services/api';
import type { PreviewSegment, TranslationJob } from '../types';
import { formatPreviewText, statusLabel } from '../utils/format';

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
    const isActive =
      job.status !== 'completed' && job.status !== 'failed' && job.status !== 'uploaded';

    if (isActive && job.segments && job.segments.length > 0) {
      let rows = job.segments;
      if (q.trim()) {
        const needle = q.trim().toLowerCase();
        rows = rows.filter(
          (s) =>
            s.segmentId.toLowerCase().includes(needle) ||
            formatPreviewText(s.original).toLowerCase().includes(needle) ||
            formatPreviewText(s.translation).toLowerCase().includes(needle),
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
    return () => { cancelled = true; };
  }, [job.id, job.status, job.segments, q, page]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-white/90 shadow-sm overflow-hidden">
      <div className="border-b border-[var(--color-line)]/60 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-[family-name:var(--font-display)] text-xl text-[var(--color-brand)]">
            Translation Preview
          </h3>
          <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
            {job.targetLanguageName} translations alongside source segments
          </p>
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-soft)]/60" aria-hidden />
          <input
            value={q}
            onChange={(e) => { setPage(1); setQ(e.target.value); }}
            placeholder="Search segments…"
            className="w-56 rounded-xl border border-[var(--color-line)] bg-white py-2 pl-9 pr-3 text-sm outline-none ring-[var(--color-brand)]/30 focus:ring-2 focus:border-[var(--color-brand)]"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-[var(--color-paper)]/60 text-xs uppercase tracking-wider text-[var(--color-ink-soft)]">
              <th className="px-4 py-3 font-semibold w-24">ID</th>
              <th className="px-4 py-3 font-semibold">Original</th>
              <th className="px-4 py-3 font-semibold">{job.targetLanguageName}</th>
              <th className="px-4 py-3 font-semibold w-28">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-line)]/50">
            {loading && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-[var(--color-ink-soft)]">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-brand)]/30 border-t-[var(--color-brand)]" />
                    Loading preview…
                  </span>
                </td>
              </tr>
            )}
            {!loading && segments.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-[var(--color-ink-soft)]">
                  No segments to display.
                </td>
              </tr>
            )}
            {!loading && segments.map((seg, idx) => (
              <tr
                key={seg.segmentId}
                className={[
                  'align-top transition-colors',
                  idx % 2 === 0 ? 'bg-white' : 'bg-[var(--color-paper)]/40',
                  'hover:bg-[color-mix(in_oklab,var(--color-brand)_3%,white)]',
                ].join(' ')}
              >
                <td className="px-4 py-3.5 font-mono text-xs text-[var(--color-brand)] align-middle">
                  {seg.segmentId}
                </td>
                <td className="max-w-xs px-4 py-3.5 text-[var(--color-ink)] leading-relaxed">
                  {formatPreviewText(seg.original) || <span className="text-[var(--color-ink-soft)]">—</span>}
                </td>
                <td className="max-w-xs px-4 py-3.5 text-[var(--color-ink)] leading-relaxed">
                  {formatPreviewText(seg.translation) || <span className="text-[var(--color-ink-soft)]/50 italic text-xs">pending…</span>}
                </td>
                <td className="px-4 py-3.5 align-middle">
                  <StatusPill status={seg.validationStatus || seg.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-[var(--color-line)]/60 px-6 py-3 flex items-center justify-between gap-3 text-sm text-[var(--color-ink-soft)] bg-[var(--color-paper)]/40">
        <span className="text-xs">
          Page <span className="font-semibold text-[var(--color-ink)]">{page}</span> of {totalPages} · {total} segments
        </span>
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-xs font-medium transition hover:bg-white disabled:opacity-40"
          >
            <ArrowLeft size={13} aria-hidden /> Prev
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-xs font-medium transition hover:bg-white disabled:opacity-40"
          >
            Next <ArrowRight size={13} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

export function CompletionCard({
  job,
  onClear,
  clearing,
}: {
  job: TranslationJob;
  onClear?: () => void;
  clearing?: boolean;
}) {
  if (job.status !== 'completed') return null;

  return (
    <div className="rounded-2xl border border-[color-mix(in_oklab,var(--color-ok)_30%,var(--color-line))] bg-white/90 shadow-sm overflow-hidden">
      <div className="h-1 w-full bg-[linear-gradient(90deg,var(--color-ok),color-mix(in_oklab,var(--color-ok)_60%,var(--color-accent)))]" />

      <div className="p-6">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--color-ok)_14%,white)] text-[var(--color-ok)]">
            <CheckCircle2 size={22} aria-hidden />
          </div>
          <div>
            <h3 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-ok)]">
              Translation Completed
            </h3>
            <p className="text-xs text-[var(--color-ink-soft)] mt-0.5">
              {job.translatedSegments} of {job.totalSegments} segments translated successfully
            </p>
          </div>
        </div>

        <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Source" value={job.sourceLanguageName} />
          <Stat label="Target" value={job.targetLanguageName} />
          <Stat label="XLIFF version" value={job.xliffVersion ?? '—'} />
          <Stat label="Output file" value={job.outputFilename ?? '—'} mono />
        </dl>

        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          <a
            href={getDownloadUrl(job.id)}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand)] px-5 py-2.5 text-sm font-semibold text-white no-underline shadow-sm transition-all hover:bg-[var(--color-brand-light)] hover:shadow-md active:scale-95"
          >
            <Download size={15} aria-hidden />
            Download {job.targetLanguageName} XLIFF
          </a>

          <a
            href={getDownloadSourceUrl(job.id)}
            title="XLIFF with translated text written into source elements — no target elements"
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-brand)] px-5 py-2.5 text-sm font-semibold text-[var(--color-brand)] no-underline transition-all hover:bg-[color-mix(in_oklab,var(--color-brand)_6%,white)] active:scale-95"
          >
            <Download size={15} aria-hidden />
            Source-Replaced XLIFF
          </a>

          {onClear && (
            <button
              type="button"
              onClick={onClear}
              disabled={clearing}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-line)] px-5 py-2.5 text-sm font-semibold text-[var(--color-ink-soft)] transition-all hover:bg-[var(--color-paper)] hover:text-[var(--color-ink)] active:scale-95 disabled:opacity-60 ml-auto"
            >
              {clearing ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                  Clearing…
                </>
              ) : (
                <>
                  <X size={15} aria-hidden />
                  Start New Translation
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl bg-[var(--color-paper)]/70 px-4 py-3">
      <dt className="text-xs text-[var(--color-ink-soft)]">{label}</dt>
      <dd className={['mt-1 text-sm font-semibold text-[var(--color-ink)] truncate', mono ? 'font-mono text-xs' : ''].join(' ')}>
        {value}
      </dd>
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

export { Row };

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
