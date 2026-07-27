import { useEffect, useState } from 'react';
import { Download, FileX2 } from 'lucide-react';
import { getDownloadUrl, getDownloadSourceUrl, getHistory } from '../services/api';
import type { TranslationJob } from '../types';
import { formatDate, statusLabel } from '../utils/format';

export function HistoryPage() {
  const [jobs, setJobs] = useState<TranslationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getHistory();
        if (!cancelled) setJobs(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load history');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-[var(--color-brand)]">
          Translation History
        </h1>
        <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
          Past XLIFF translation jobs and their downloads.
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-[var(--color-ink-soft)]">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-brand)]/30 border-t-[var(--color-brand)]" />
          Loading history…
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-[color-mix(in_oklab,var(--color-danger)_10%,white)] border border-[color-mix(in_oklab,var(--color-danger)_20%,white)] px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      )}

      {!loading && !error && jobs.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[var(--color-line)] bg-white/60 px-6 py-20 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-[var(--color-paper-2)] text-[var(--color-ink-soft)]">
            <FileX2 size={24} strokeWidth={1.5} aria-hidden />
          </div>
          <p className="font-medium text-[var(--color-ink-soft)]">No translation jobs yet.</p>
          <p className="mt-1 text-xs text-[var(--color-ink-soft)]/60">Completed translations will appear here.</p>
        </div>
      )}

      {jobs.length > 0 && (
        <div className="rounded-2xl border border-[var(--color-line)] bg-white/90 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-line)] bg-[var(--color-paper)]/60 text-xs uppercase tracking-wider text-[var(--color-ink-soft)]">
                  <th className="px-4 py-3 font-semibold">Filename</th>
                  <th className="px-4 py-3 font-semibold">Source → Target</th>
                  <th className="px-4 py-3 font-semibold">Version</th>
                  <th className="px-4 py-3 font-semibold">Segments</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Downloads</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-line)]/50">
                {jobs.map((job, idx) => {
                  const isCompleted = job.status === 'completed';
                  const isFailed = job.status === 'failed';
                  return (
                    <tr
                      key={job.id}
                      className={[
                        'transition-colors',
                        idx % 2 === 0 ? 'bg-white' : 'bg-[var(--color-paper)]/30',
                        'hover:bg-[color-mix(in_oklab,var(--color-brand)_3%,white)]',
                      ].join(' ')}
                    >
                      <td className="px-4 py-3.5 font-medium text-[var(--color-ink)] max-w-[200px] truncate">
                        {job.originalFilename}
                      </td>
                      <td className="px-4 py-3.5 text-[var(--color-ink-soft)] whitespace-nowrap">
                        <span className="font-medium text-[var(--color-ink)]">{job.sourceLanguageName}</span>
                        <span className="mx-1.5 text-[var(--color-ink-soft)]/50">→</span>
                        <span className="font-medium text-[var(--color-ink)]">{job.targetLanguageName}</span>
                      </td>
                      <td className="px-4 py-3.5 text-[var(--color-ink-soft)]">{job.xliffVersion ?? '—'}</td>
                      <td className="px-4 py-3.5 tabular-nums">
                        {isCompleted ? (
                          <span>
                            <span className="font-semibold text-[var(--color-ok)]">{job.translatedSegments}</span>
                            <span className="text-[var(--color-ink-soft)]">/{job.totalSegments}</span>
                          </span>
                        ) : (
                          <span className="text-[var(--color-ink-soft)]">{job.totalSegments}</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={[
                          'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold',
                          isCompleted
                            ? 'bg-[color-mix(in_oklab,var(--color-ok)_14%,white)] text-[var(--color-ok)]'
                            : isFailed
                              ? 'bg-[color-mix(in_oklab,var(--color-danger)_14%,white)] text-[var(--color-danger)]'
                              : 'bg-[var(--color-paper-2)] text-[var(--color-ink-soft)]',
                        ].join(' ')}>
                          {isCompleted ? 'Completed' : isFailed ? 'Failed' : statusLabel(job.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-[var(--color-ink-soft)] text-xs">
                        {formatDate(job.createdAt)}
                      </td>
                      <td className="px-4 py-3.5">
                        {isCompleted ? (
                          <div className="flex items-center gap-2">
                            {/* <a
                              href={getDownloadUrl(job.id)}
                              className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-brand)] px-3 py-1.5 text-xs font-semibold text-white no-underline transition hover:bg-[var(--color-brand-light)]"
                            >
                              <Download size={12} aria-hidden />
                              Bilingual
                            </a> */}
                            <a
                              href={getDownloadSourceUrl(job.id)}
                              title="Source-replaced XLIFF"
                            className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-brand)] px-3 py-1.5 text-xs font-semibold text-white no-underline transition hover:bg-[var(--color-brand-light)]"
                            >
                              <Download size={12} aria-hidden />
                              Download
                            </a>
                          </div>
                        ) : (
                          <span className="text-[var(--color-ink-soft)]/50">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-[var(--color-line)]/40 bg-[var(--color-paper)]/40 px-4 py-2.5 text-xs text-[var(--color-ink-soft)]">
            {jobs.length} job{jobs.length !== 1 ? 's' : ''} total
          </div>
        </div>
      )}
    </div>
  );
}
