import { useState, useRef, useCallback, useEffect } from 'react';
import { useQAValidation } from '../contexts/QAValidationContext';
import {
  Upload, CheckCircle2, AlertTriangle, XCircle, Info,
  Search, ArrowLeft, ArrowRight, FileText, GitCompare, ScanSearch, X,
} from 'lucide-react';
import type { QAResult, QASegmentResult, QASegmentStatus } from '../types';
import { TARGET_LANGUAGES } from '../types';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

// ── SSE helpers ───────────────────────────────────────────────────────────────

interface QABatchData {
  segments: QASegmentResult[];
  reviewedSoFar: number;
  totalToReview: number;
}

function runQACompareSSE(
  source: File,
  translated: File,
  targetLanguage: string,
  onBatch: (data: QABatchData) => void,
  signal: AbortSignal,
  jobId?: string,
  onJobStarted?: (jobId: string) => void,
): Promise<QAResult> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('source', source);
    form.append('translated', translated);
    form.append('targetLanguage', targetLanguage);
    if (jobId) {
      form.append('jobId', jobId);
    }

    fetch(`${API_BASE}/qa/compare`, {
      method: 'POST',
      body: form,
      signal,
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: jobStarted\n')) {
            const dataMatch = line.match(/data: (.+)/);
            if (dataMatch) {
              try {
                const { jobId: serverJobId } = JSON.parse(dataMatch[1]) as { jobId: string };
                onJobStarted?.(serverJobId);
              } catch (e) {
                console.error('Failed to parse jobStarted data:', e);
              }
            }
          } else if (line.startsWith('event: batch\n')) {
            const dataMatch = line.match(/data: (.+)/);
            if (dataMatch) {
              try {
                const data = JSON.parse(dataMatch[1]) as QABatchData;
                onBatch(data);
              } catch (e) {
                console.error('Failed to parse batch data:', e);
              }
            }
          } else if (line.startsWith('event: done\n')) {
            const dataMatch = line.match(/data: (.+)/);
            if (dataMatch) {
              try {
                const result = JSON.parse(dataMatch[1]) as QAResult;
                resolve(result);
              } catch (e) {
                console.error('Failed to parse result:', e);
              }
            }
            return;
          } else if (line.startsWith('event: error\n')) {
            const dataMatch = line.match(/data: (.+)/);
            if (dataMatch) {
              try {
                const error = JSON.parse(dataMatch[1]) as { message: string };
                reject(new Error(error.message));
              } catch (e) {
                reject(new Error('Unknown error'));
              }
            }
            return;
          }
        }
      }
    }).catch(reject);
  });
}

function runQAReviewSSE(
  file: File,
  targetLanguage: string,
  onBatch: (data: QABatchData) => void,
  signal: AbortSignal,
  jobId?: string,
  onJobStarted?: (jobId: string) => void,
): Promise<QAResult> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    form.append('targetLanguage', targetLanguage);
    if (jobId) {
      form.append('jobId', jobId);
    }

    fetch(`${API_BASE}/qa/review`, {
      method: 'POST',
      body: form,
      signal,
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: jobStarted\n')) {
            const dataMatch = line.match(/data: (.+)/);
            if (dataMatch) {
              try {
                const { jobId: serverJobId } = JSON.parse(dataMatch[1]) as { jobId: string };
                onJobStarted?.(serverJobId);
              } catch (e) {
                console.error('Failed to parse jobStarted data:', e);
              }
            }
          } else if (line.startsWith('event: batch\n')) {
            const dataMatch = line.match(/data: (.+)/);
            if (dataMatch) {
              try {
                const data = JSON.parse(dataMatch[1]) as QABatchData;
                onBatch(data);
              } catch (e) {
                console.error('Failed to parse batch data:', e);
              }
            }
          } else if (line.startsWith('event: done\n')) {
            const dataMatch = line.match(/data: (.+)/);
            if (dataMatch) {
              try {
                const result = JSON.parse(dataMatch[1]) as QAResult;
                resolve(result);
              } catch (e) {
                console.error('Failed to parse result:', e);
              }
            }
            return;
          } else if (line.startsWith('event: error\n')) {
            const dataMatch = line.match(/data: (.+)/);
            if (dataMatch) {
              try {
                const error = JSON.parse(dataMatch[1]) as { message: string };
                reject(new Error(error.message));
              } catch (e) {
                reject(new Error('Unknown error'));
              }
            }
            return;
          }
        }
      }
    }).catch(reject);
  });
}

const STATUS_CONFIG: Record<QASegmentStatus, { label: string; color: string; icon: React.ReactNode }> = {
  ok:      { label: 'OK',      color: 'text-[var(--color-ok)] bg-[color-mix(in_oklab,var(--color-ok)_12%,white)]',      icon: <CheckCircle2 size={13} /> },
  warning: { label: 'Warning', color: 'text-[var(--color-warn)] bg-[color-mix(in_oklab,var(--color-warn)_12%,white)]',  icon: <AlertTriangle size={13} /> },
  error:   { label: 'Error',   color: 'text-[var(--color-danger)] bg-[color-mix(in_oklab,var(--color-danger)_12%,white)]', icon: <XCircle size={13} /> },
  missing: { label: 'Missing', color: 'text-[var(--color-ink-soft)] bg-[var(--color-paper-2)]',                          icon: <Info size={13} /> },
};

// ── file drop zone ────────────────────────────────────────────────────────────

function FileDropZone({
  label,
  file,
  onFile,
  disabled,
}: {
  label: string;
  file: File | null;
  onFile: (f: File) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const accept = (f: File | undefined) => {
    if (!f) return;
    const lower = f.name.toLowerCase();
    if (!lower.endsWith('.xlf') && !lower.endsWith('.xliff')) return;
    onFile(f);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!disabled) accept(e.dataTransfer.files?.[0]);
  }, [disabled]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
      className={[
        'relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-8 text-center cursor-pointer transition-all duration-200 select-none',
        dragging
          ? 'border-[var(--color-brand)] bg-[color-mix(in_oklab,var(--color-brand)_6%,white)] scale-[1.01]'
          : file
            ? 'border-[var(--color-ok)] bg-[color-mix(in_oklab,var(--color-ok)_4%,white)]'
            : 'border-[var(--color-line)] bg-white/60 hover:border-[var(--color-brand)]/60',
        disabled ? 'pointer-events-none opacity-50' : '',
      ].join(' ')}
    >
      <div className={[
        'grid h-12 w-12 place-items-center rounded-xl transition-all',
        file
          ? 'bg-[color-mix(in_oklab,var(--color-ok)_14%,white)] text-[var(--color-ok)]'
          : 'bg-[var(--color-paper-2)] text-[var(--color-brand)]',
      ].join(' ')}>
        {file ? <FileText size={22} strokeWidth={1.5} aria-hidden /> : <Upload size={22} strokeWidth={1.75} aria-hidden />}
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-soft)]">{label}</p>
        {file ? (
          <p className="mt-1 text-sm font-semibold text-[var(--color-ink)] truncate max-w-[200px]">{file.name}</p>
        ) : (
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">Drop .xlf / .xliff or click</p>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".xlf,.xliff"
        className="hidden"
        onChange={(e) => { accept(e.target.files?.[0]); e.target.value = ''; }}
        disabled={disabled}
      />
    </div>
  );
}

// ── status pill ───────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: QASegmentStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ── summary bar ───────────────────────────────────────────────────────────────

function SummaryBar({ result }: { result: QAResult }) {
  const pct = (n: number) => Math.round((n / result.totalSegments) * 100);
  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-white/90 shadow-sm overflow-hidden">
      <div className="h-1 w-full bg-[var(--color-paper-2)] flex overflow-hidden">
        <div className="bg-[var(--color-ok)] transition-all" style={{ width: `${pct(result.okCount)}%` }} />
        <div className="bg-[var(--color-warn)] transition-all" style={{ width: `${pct(result.warningCount)}%` }} />
        <div className="bg-[var(--color-danger)] transition-all" style={{ width: `${pct(result.errorCount)}%` }} />
        <div className="bg-[var(--color-paper-2)] transition-all" style={{ width: `${pct(result.missingCount)}%` }} />
      </div>
      <div className="p-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="OK" value={result.okCount} color="text-[var(--color-ok)]" />
        <Stat label="Warnings" value={result.warningCount} color="text-[var(--color-warn)]" />
        <Stat label="Errors" value={result.errorCount} color="text-[var(--color-danger)]" />
        <Stat label="Missing" value={result.missingCount} color="text-[var(--color-ink-soft)]" />
      </div>
      <div className="border-t border-[var(--color-line)]/50 px-5 py-3 text-xs text-[var(--color-ink-soft)]">
        {result.sourceFilename === result.translatedFilename ? (
          <>Reviewed <span className="font-semibold text-[var(--color-ink)]">{result.sourceFilename}</span></>
        ) : (
          <>
            Compared <span className="font-semibold text-[var(--color-ink)]">{result.sourceFilename}</span>
            {' → '}
            <span className="font-semibold text-[var(--color-ink)]">{result.translatedFilename}</span>
          </>
        )}
        {' · '}{result.totalSegments} segments
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <p className={`text-2xl font-[family-name:var(--font-display)] font-semibold ${color}`}>{value}</p>
      <p className="text-xs text-[var(--color-ink-soft)]">{label}</p>
    </div>
  );
}

// ── results table ─────────────────────────────────────────────────────────────

type FilterStatus = 'all' | QASegmentStatus;

function ResultsTable({ segments, mode }: { segments: QASegmentResult[]; mode?: QAMode }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const filtered = segments.filter((s) => {
    if (filter !== 'all' && s.status !== filter) return false;
    if (!q.trim()) return true;
    const needle = q.toLowerCase();
    return (
      s.segmentId.toLowerCase().includes(needle) ||
      s.sourceText.toLowerCase().includes(needle) ||
      s.translatedText.toLowerCase().includes(needle) ||
      s.suggestion.toLowerCase().includes(needle)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page_ = Math.min(page, totalPages);
  const rows = filtered.slice((page_ - 1) * pageSize, page_ * pageSize);

  const filterBtns: { key: FilterStatus; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'error', label: 'Errors' },
    { key: 'warning', label: 'Warnings' },
    { key: 'ok', label: 'OK' },
    { key: 'missing', label: 'Missing' },
  ];

  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-white/90 shadow-sm overflow-hidden">
      {/* toolbar */}
      <div className="border-b border-[var(--color-line)]/60 px-5 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5 flex-wrap">
          {filterBtns.map((btn) => (
            <button
              key={btn.key}
              type="button"
              onClick={() => { setFilter(btn.key); setPage(1); }}
              className={[
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                filter === btn.key
                  ? 'bg-[var(--color-brand)] text-white'
                  : 'border border-[var(--color-line)] text-[var(--color-ink-soft)] hover:bg-[var(--color-paper)]',
              ].join(' ')}
            >
              {btn.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-soft)]/60" aria-hidden />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Search…"
            className="w-48 rounded-xl border border-[var(--color-line)] bg-white py-1.5 pl-8 pr-3 text-sm outline-none focus:ring-2 ring-[var(--color-brand)]/30"
          />
        </div>
      </div>

      {/* table */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-[var(--color-paper)]/60 text-xs uppercase tracking-wider text-[var(--color-ink-soft)]">
              <th className="px-4 py-3 font-semibold w-20">ID</th>
              <th className="px-4 py-3 font-semibold">
                {mode === 'compare' ? 'Version A' : 'Source'}
              </th>
              <th className="px-4 py-3 font-semibold">
                {mode === 'compare' ? 'Version B' : mode === 'review' ? 'Segment text' : 'Translation'}
              </th>
              <th className="px-4 py-3 font-semibold">AI Suggestion</th>
              <th className="px-4 py-3 font-semibold w-24">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-line)]/50">
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-[var(--color-ink-soft)]">
                  No segments match the current filter.
                </td>
              </tr>
            )}
            {rows.map((seg, idx) => (
              <tr
                key={seg.segmentId}
                className={[
                  'align-top transition-colors',
                  idx % 2 === 0 ? 'bg-white' : 'bg-[var(--color-paper)]/30',
                  seg.status === 'error' ? 'border-l-2 border-l-[var(--color-danger)]' :
                  seg.status === 'warning' ? 'border-l-2 border-l-[var(--color-warn)]' : '',
                ].join(' ')}
              >
                <td className="px-4 py-3.5 font-mono text-xs text-[var(--color-brand)] align-top pt-4">
                  {seg.segmentId}
                </td>
                <td className="px-4 py-3.5 max-w-[220px] text-[var(--color-ink)] leading-relaxed align-top">
                  {seg.sourceText || <span className="italic text-[var(--color-ink-soft)]/50">—</span>}
                </td>
                <td className="px-4 py-3.5 max-w-[220px] text-[var(--color-ink)] leading-relaxed align-top">
                  {seg.translatedText || <span className="italic text-[var(--color-ink-soft)]/50 text-xs">missing</span>}
                </td>
                <td className="px-4 py-3.5 max-w-[260px] text-xs text-[var(--color-ink-soft)] leading-relaxed align-top">
                  {seg.suggestion}
                </td>
                <td className="px-4 py-3.5 align-top pt-4">
                  <StatusPill status={seg.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* pagination */}
      <div className="border-t border-[var(--color-line)]/60 px-5 py-3 flex items-center justify-between gap-3 bg-[var(--color-paper)]/40 text-xs text-[var(--color-ink-soft)]">
        <span>
          Page <span className="font-semibold text-[var(--color-ink)]">{page_}</span> of {totalPages} · {filtered.length} segments
        </span>
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={page_ <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-line)] px-3 py-1.5 font-medium transition hover:bg-white disabled:opacity-40"
          >
            <ArrowLeft size={12} /> Prev
          </button>
          <button
            type="button"
            disabled={page_ >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-line)] px-3 py-1.5 font-medium transition hover:bg-white disabled:opacity-40"
          >
            Next <ArrowRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

type QAMode = 'compare' | 'review';

export function QAPage() {
  const [mode, setMode] = useState<QAMode>('compare');

  // compare state
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [translatedFile, setTranslatedFile] = useState<File | null>(null);

  // review state
  const [reviewFile, setReviewFile] = useState<File | null>(null);

  const [targetLanguage, setTargetLanguage] = useState('de');
  const [validatedPage, setValidatedPage] = useState(1);
  const validatedPageSize = 10;
  const abortControllerRef = useRef<AbortController | null>(null);
  const isRunningRef = useRef(false); // Prevent duplicate runs

  // Use global QA validation context
  const { state: qaState, startValidation, cancelValidation, updateProgress, clearValidation, markSseComplete, updateJobId } = useQAValidation();
  const result = qaState.result;

  const clearAll = () => {
    setSourceFile(null);
    setTranslatedFile(null);
    setReviewFile(null);
    setValidatedPage(1);
    clearValidation();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const handleCancel = async () => {
    // Cancel server-side job via context (this also aborts SSE and cleans up)
    await cancelValidation();
  };

  // Cancel active validation when a new file is dropped into a zone
  const handleSourceFileChange = (file: File) => {
    if (qaState.running) void cancelValidation();
    setSourceFile(file);
  };

  const handleTranslatedFileChange = (file: File) => {
    if (qaState.running) void cancelValidation();
    setTranslatedFile(file);
  };

  const handleReviewFileChange = (file: File) => {
    if (qaState.running) void cancelValidation();
    setReviewFile(file);
  };

  const switchMode = (m: QAMode) => {
    setMode(m);
  };

  // Cleanup on unmount - don't abort, let validation continue in background
  useEffect(() => {
    return () => {
      // Intentionally NOT aborting here - let validation continue on server
      // abortControllerRef.current?.abort();
    };
  }, []);

  const canRun = mode === 'compare'
    ? sourceFile !== null && translatedFile !== null && !qaState.running
    : reviewFile !== null && !qaState.running;

  const handleRun = async () => {
    if (!canRun) return;
    
    // Prevent duplicate runs
    if (isRunningRef.current) {
      return;
    }
    
    isRunningRef.current = true;
    setValidatedPage(1);
    
    abortControllerRef.current = new AbortController();
    
    // Generate a temporary job ID for the context
    const tempJobId = crypto.randomUUID();
    await startValidation(tempJobId, mode, abortControllerRef.current);
    
    let data: QAResult | undefined;
    try {
      data = mode === 'compare'
        ? await runQACompareSSE(
            sourceFile!,
            translatedFile!,
            targetLanguage,
            (batchData) => {
              updateProgress(batchData.segments, batchData.reviewedSoFar, batchData.totalToReview);
            },
            abortControllerRef.current.signal,
            tempJobId,
            (serverJobId) => updateJobId(serverJobId),
          )
        : await runQAReviewSSE(
            reviewFile!,
            targetLanguage,
            (batchData) => {
              updateProgress(batchData.segments, batchData.reviewedSoFar, batchData.totalToReview);
            },
            abortControllerRef.current.signal,
            tempJobId,
            (serverJobId) => updateJobId(serverJobId),
          );
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Context will handle cancellation via polling
        console.error('Validation was cancelled.');
      } else {
        // Context will handle error state via polling
        console.error('QA review failed:', err instanceof Error ? err.message : 'Unknown error');
      }
    } finally {
      abortControllerRef.current = null;
      isRunningRef.current = false;
      // Signal the context that SSE is done so polling can resume as fallback
      markSseComplete(data ?? null);
    }
  };

  return (
    <div className="space-y-6">
      {/* page header */}
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-[var(--color-brand)]">
          QA Review
        </h1>
        <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
          Check translation quality using AI — compare two files or validate a single translated file.
        </p>
      </div>

      {/* mode toggle */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => switchMode('compare')}
          className={[
            'inline-flex items-center gap-2 rounded-xl border px-5 py-3 text-sm font-semibold transition-all',
            mode === 'compare'
              ? 'border-[var(--color-brand)] bg-[var(--color-brand)] text-white shadow-sm'
              : 'border-[var(--color-line)] bg-white/80 text-[var(--color-ink-soft)] hover:border-[var(--color-brand)]/50 hover:text-[var(--color-ink)]',
          ].join(' ')}
        >
          <GitCompare size={16} aria-hidden />
          Compare two files
        </button>
        <button
          type="button"
          onClick={() => switchMode('review')}
          className={[
            'inline-flex items-center gap-2 rounded-xl border px-5 py-3 text-sm font-semibold transition-all',
            mode === 'review'
              ? 'border-[var(--color-brand)] bg-[var(--color-brand)] text-white shadow-sm'
              : 'border-[var(--color-line)] bg-white/80 text-[var(--color-ink-soft)] hover:border-[var(--color-brand)]/50 hover:text-[var(--color-ink)]',
          ].join(' ')}
        >
          <ScanSearch size={16} aria-hidden />
          Validate translated file
        </button>
      </div>

      {/* upload + config card */}
      <div className="rounded-2xl border border-[var(--color-line)] bg-white/90 shadow-sm overflow-hidden">
        <div className="h-1 w-full bg-[linear-gradient(90deg,var(--color-brand),var(--color-accent))]" />
        <div className="p-6 space-y-5">

          {mode === 'compare' ? (
            <>
              <p className="text-sm text-[var(--color-ink-soft)]">
                Upload <span className="font-semibold text-[var(--color-ink)]">two edited or translated XLIFF files</span> in the same language. The AI compares every segment between the two versions — flagging inconsistencies, terminology differences, and suggesting which version is better.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <FileDropZone label="Version A" file={sourceFile} onFile={handleSourceFileChange} disabled={qaState.running} />
                <FileDropZone label="Version B" file={translatedFile} onFile={handleTranslatedFileChange} disabled={qaState.running} />
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-[var(--color-ink-soft)]">
                Upload a <span className="font-semibold text-[var(--color-ink)]">translated XLIFF</span> and select the language it was converted to. The AI will check every segment — is it correct, natural, and properly translated into that language?
              </p>
              <div className="max-w-sm">
                <FileDropZone label="Translated XLIFF to validate" file={reviewFile} onFile={handleReviewFileChange} disabled={qaState.running} />
              </div>
            </>
          )}

          <div className="flex flex-wrap items-end gap-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-soft)]">
                {mode === 'compare' ? 'Language of both files' : 'Language the file was converted to'}
              </span>
              <select
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
                disabled={qaState.running}
                className="mt-1.5 block rounded-xl border border-[var(--color-line)] bg-white px-3 py-2 text-sm font-semibold text-[var(--color-ink)] focus:border-[var(--color-brand)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/20 disabled:opacity-60"
              >
                {TARGET_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.name}</option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={handleRun}
              disabled={!canRun}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand)] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[var(--color-brand-light)] hover:shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {qaState.running ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  {mode === 'compare' ? 'Comparing…' : 'Validating…'}
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} aria-hidden />
                  {mode === 'compare' ? 'Run QA Comparison' : 'Validate File'}
                </>
              )}
            </button>

            {(sourceFile || translatedFile || reviewFile) && !qaState.running && (
              <button
                type="button"
                onClick={clearAll}
                className="text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-danger)] transition-colors underline"
              >
                Clear
              </button>
            )}

            {qaState.running && (
              <button
                type="button"
                onClick={handleCancel}
                className="text-xs text-[var(--color-danger)] hover:text-[var(--color-danger)] transition-colors underline"
              >
                Cancel Validation
              </button>
            )}
          </div>
        </div>
      </div>

      {/* running indicator with progress */}
      {qaState.running && (
        <div className="rounded-2xl border border-[var(--color-line)] bg-white/90 shadow-sm overflow-hidden">
          {/* progress bar */}
          <div className="h-1.5 w-full bg-[var(--color-paper-2)]">
            <div
              className="h-full bg-[linear-gradient(90deg,var(--color-brand),var(--color-accent))] transition-all duration-300"
              style={{ width: `${qaState.progress.total > 0 ? (qaState.progress.reviewed / qaState.progress.total) * 100 : 0}%` }}
            />
          </div>
          
          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="text-sm font-semibold text-[var(--color-ink)]">
                  {mode === 'compare' ? 'Running QA comparison…' : 'Validating translated file…'}
                </p>
                <p className="text-xs text-[var(--color-ink-soft)] mt-0.5">
                  <span className="font-medium text-[var(--color-ok)]">{qaState.progress.reviewed}</span>
                  {' of '}
                  <span className="font-medium">{qaState.progress.total}</span>
                  {' segments validated'}
                  {qaState.progress.total > 0 && (
                    <>
                      {' · '}
                      <span className="font-medium">{Math.round((qaState.progress.reviewed / qaState.progress.total) * 100)}%</span>
                    </>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCancel}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-danger)]/30 bg-[color-mix(in_oklab,var(--color-danger)_8%,white)] px-3 py-1.5 text-xs font-semibold text-[var(--color-danger)] transition-all hover:bg-[color-mix(in_oklab,var(--color-danger)_12%,white)] hover:border-[var(--color-danger)]/50"
              >
                <X size={12} />
                Cancel
              </button>
            </div>

            {/* validated segments preview */}
            <div className="mt-4 rounded-xl border border-[var(--color-line)]/60 bg-[var(--color-paper)]/30 overflow-hidden">
              <div className="border-b border-[var(--color-line)]/50 px-4 py-2 bg-[var(--color-paper)]/50">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-soft)]">
                  Validated segments ({qaState.validatedSegments.length})
                </p>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {qaState.validatedSegments.length === 0 ? (
                  <div className="px-4 py-8 text-center text-xs text-[var(--color-ink-soft)]">
                    <span className="inline-block animate-pulse">Waiting for segments to validate...</span>
                  </div>
                ) : (
                  <>
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-[var(--color-paper)]/40 text-[var(--color-ink-soft)]">
                      <tr>
                        <th className="px-3 py-2 font-semibold w-16">ID</th>
                        <th className="px-3 py-2 font-semibold">Status</th>
                        <th className="px-3 py-2 font-semibold">Translated Text</th>
                        <th className="px-3 py-2 font-semibold">Suggestion</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-line)]/40">
                      {Array.isArray(qaState.validatedSegments) && qaState.validatedSegments
                        .slice((validatedPage - 1) * validatedPageSize, validatedPage * validatedPageSize)
                        .map((seg) => (
                        <tr key={seg.segmentId} className="hover:bg-[var(--color-paper)]/50">
                          <td className="px-3 py-2 font-mono text-[var(--color-brand)]">{seg.segmentId}</td>
                          <td className="px-3 py-2">
                            <StatusPill status={seg.status} />
                          </td>
                          <td className="px-3 py-2 text-[var(--color-ink)] max-w-sm">{seg.translatedText || seg.sourceText || '—'}</td>
                          <td className="px-3 py-2 text-[var(--color-ink-soft)] max-w-sm">{seg.suggestion}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {/* pagination */}
                  <div className="border-t border-[var(--color-line)]/50 px-4 py-2 flex items-center justify-between gap-2 bg-[var(--color-paper)]/40 text-xs text-[var(--color-ink-soft)]">
                    <span>
                      Page <span className="font-semibold text-[var(--color-ink)]">{validatedPage}</span> of {Math.max(1, Math.ceil(qaState.validatedSegments.length / validatedPageSize))}
                    </span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        disabled={validatedPage <= 1}
                        onClick={() => setValidatedPage((p) => Math.max(1, p - 1))}
                        className="inline-flex items-center gap-1 rounded border border-[var(--color-line)] px-2 py-1 transition hover:bg-white disabled:opacity-40"
                      >
                        <ArrowLeft size={10} />
                      </button>
                      <button
                        type="button"
                        disabled={validatedPage >= Math.ceil(qaState.validatedSegments.length / validatedPageSize)}
                        onClick={() => setValidatedPage((p) => Math.min(Math.ceil(qaState.validatedSegments.length / validatedPageSize), p + 1))}
                        className="inline-flex items-center gap-1 rounded border border-[var(--color-line)] px-2 py-1 transition hover:bg-white disabled:opacity-40"
                      >
                        <ArrowRight size={10} />
                      </button>
                    </div>
                  </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* error */}
      {qaState.error && (
        <div className="flex items-center gap-3 rounded-xl bg-[color-mix(in_oklab,var(--color-danger)_10%,white)] border border-[color-mix(in_oklab,var(--color-danger)_20%,white)] px-4 py-3 text-sm text-[var(--color-danger)]">
          <XCircle size={16} className="shrink-0" />
          {qaState.error}
        </div>
      )}

      {/* results */}
      {result && (
        <>
          <SummaryBar result={result} />
          <ResultsTable segments={result.segments} mode={mode} />
        </>
      )}
    </div>
  );
}
