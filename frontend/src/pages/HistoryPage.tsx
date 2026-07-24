import { useEffect, useState } from 'react';
import { getDownloadUrl, getHistory } from '../services/api';
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
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load history');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-[var(--color-brand)]">
          Translation History
        </h1>
        <p className="mt-2 text-[var(--color-ink-soft)]">
          Past XLIFF translation jobs and downloads.
        </p>
      </div>

      {loading && <p className="text-sm text-[var(--color-ink-soft)]">Loading history…</p>}
      {error && (
        <p className="rounded-xl bg-[color-mix(in_oklab,var(--color-danger)_12%,white)] px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      {!loading && !error && jobs.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[var(--color-line)] bg-white/60 px-6 py-16 text-center">
          <p className="text-[var(--color-ink-soft)]">No translation jobs yet.</p>
        </div>
      )}

      {jobs.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-[var(--color-line)] bg-white/80 shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-line)] text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
                <th className="px-4 py-3">Filename</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Version</th>
                <th className="px-4 py-3">Segments</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Download</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const status =
                  job.status === 'completed'
                    ? 'Completed'
                    : job.status === 'failed'
                      ? 'Failed'
                      : 'Processing';
                return (
                  <tr key={job.id} className="border-b border-[var(--color-line)]/70">
                    <td className="px-4 py-3 font-medium">{job.originalFilename}</td>
                    <td className="px-4 py-3">{job.sourceLanguageName}</td>
                    <td className="px-4 py-3">{job.targetLanguageName}</td>
                    <td className="px-4 py-3">{job.xliffVersion ?? '—'}</td>
                    <td className="px-4 py-3">{job.totalSegments}</td>
                    <td className="px-4 py-3">
                      <span
                        className={[
                          'rounded-full px-2.5 py-1 text-xs font-medium',
                          status === 'Completed'
                            ? 'bg-[color-mix(in_oklab,var(--color-ok)_14%,white)] text-[var(--color-ok)]'
                            : status === 'Failed'
                              ? 'bg-[color-mix(in_oklab,var(--color-danger)_14%,white)] text-[var(--color-danger)]'
                              : 'bg-[var(--color-paper-2)] text-[var(--color-ink-soft)]',
                        ].join(' ')}
                      >
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatDate(job.createdAt)}</td>
                    <td className="px-4 py-3">
                      {job.status === 'completed' ? (
                        <a
                          href={getDownloadUrl(job.id)}
                          className="font-semibold text-[var(--color-brand)] no-underline hover:underline"
                        >
                          Download
                        </a>
                      ) : (
                        <span className="text-[var(--color-ink-soft)]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="sr-only">{statusLabel('completed')}</p>
        </div>
      )}
    </div>
  );
}
