import { Search, Download, CheckCircle2, X, ArrowLeft, ArrowRight, Pencil, Check as CheckIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getDownloadSourceUrl, getPreview, updateSegmentTranslation } from '../services/api';
import type { PreviewSegment, TranslationJob } from '../types';
import { formatPreviewText, statusLabel } from '../utils/format';

interface Props {
  job: TranslationJob;
}

// Strips XML tags for display — removes tag wrappers but NOT their inner content
// so <bpt id="1">&lt;Style&gt;</bpt><g id="2">Hello</g><ept id="1">&lt;/Style&gt;</ept>
// becomes "Hello"
function stripTagsForDisplay(value: string): string {
  if (!value.includes('<')) return value;
  // Remove bpt/ept pairs INCLUDING their inner content (they contain code like &lt;Style&gt;)
  let result = value.replace(/<bpt\b[^>]*>[\s\S]*?<\/bpt>/gi, '');
  result = result.replace(/<ept\b[^>]*>[\s\S]*?<\/ept>/gi, '');
  result = result.replace(/<ph\b[^>]*>[\s\S]*?<\/ph>/gi, '');
  result = result.replace(/<ph\b[^>]*\/>/gi, '');
  // Remove remaining tag wrappers (g, mrk, x etc) but keep their text content
  result = result.replace(/<[^>]+>/g, '');
  return result.trim();
}

// Puts edited plain text back into the longest text node in the original tagged string
function reinjectTags(original: string, editedText: string): string {
  if (!original.includes('<')) return editedText;
  const parts = original.split(/(<[^>]+>)/);
  let longestIdx = -1;
  let longestLen = -1;
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i].startsWith('<') && parts[i].trim().length > longestLen) {
      longestLen = parts[i].trim().length;
      longestIdx = i;
    }
  }
  if (longestIdx === -1) return editedText;
  const result = [...parts];
  result[longestIdx] = editedText;
  return result.join('');
}

// Editable cell — edit raw XML/XLIFF directly, preserving all tags
function EditableCell({
  value,
  placeholder,
  editable,
  onChange,
}: {
  value: string;
  placeholder?: string;
  editable: boolean;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // sync draft when value changes from outside (new translation arrived)
  useEffect(() => {
    if (!editing) setDraft(stripTagsForDisplay(value));
  }, [value, editing]);

  // Auto-size the textarea to fit its content whenever the draft changes
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft, editing]);

  const commit = () => {
    setEditing(false);
    const plainOriginal = stripTagsForDisplay(value);
    if (draft === plainOriginal) return; // no change
    const saved = value.includes('<') ? reinjectTags(value, draft) : draft;
    onChange(saved);
  };

  const startEditing = () => {
    setDraft(stripTagsForDisplay(value));
    setEditing(true);
  };

  if (!editable) {
    return (
      <span className="text-[var(--color-ink)] leading-relaxed">
        {formatPreviewText(stripTagsForDisplay(value)) || <span className="text-[var(--color-ink-soft)]/50 italic text-xs">—</span>}
      </span>
    );
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1.5">
        <textarea
          ref={textareaRef}
          value={draft}
          autoFocus
          rows={3}
          onChange={(e) => {
            setDraft(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { setEditing(false); setDraft(stripTagsForDisplay(value)); }
          }}
          style={{ minHeight: '4.5rem' }}
          className="w-full rounded-lg border border-[var(--color-brand)]/50 bg-white px-2.5 py-1.5 text-sm text-[var(--color-ink)] leading-relaxed outline-none ring-2 ring-[var(--color-brand)]/20 resize-y font-mono overflow-auto"
        />
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={commit}
            className="inline-flex items-center gap-1 rounded-md bg-[var(--color-brand)] px-2 py-1 text-xs font-semibold text-white transition hover:bg-[var(--color-brand-light)]"
          >
            <CheckIcon size={11} /> Save
          </button>
          <button
            type="button"
            onClick={() => { setEditing(false); setDraft(stripTagsForDisplay(value)); }}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--color-line)] px-2 py-1 text-xs font-semibold text-[var(--color-ink-soft)] transition hover:bg-[var(--color-paper)]"
          >
            <X size={11} /> Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="group relative cursor-text rounded-lg px-2.5 py-1.5 -mx-2.5 -my-1.5 hover:bg-[color-mix(in_oklab,var(--color-brand)_5%,white)] transition-colors"
      onClick={startEditing}
      title="Click to edit"
    >
      <span className="text-[var(--color-ink)] leading-relaxed">
        {formatPreviewText(stripTagsForDisplay(value)) || <span className="text-[var(--color-ink-soft)]/50 italic text-xs">{placeholder ?? 'pending…'}</span>}
      </span>
      <Pencil
        size={11}
        className="absolute right-1.5 top-1.5 opacity-0 group-hover:opacity-60 text-[var(--color-brand)] transition-opacity"
        aria-hidden
      />
    </div>
  );
}

export function PreviewTable({ job }: Props) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [segments, setSegments] = useState<PreviewSegment[]>([]);
  const [loading, setLoading] = useState(false);
  const pageSize = 10;
  const localEdits = useRef<Record<string, string>>({});

  const isUploaded = job.status === 'uploaded';
  const isActive =
    job.status !== 'completed' && job.status !== 'failed' && job.status !== 'uploaded';
  const isCompleted = job.status === 'completed';

  useEffect(() => {
    let cancelled = false;

    // While actively translating: use live segments from job poll
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

    // For uploaded + completed + failed: fetch from preview API
    const load = async () => {
      setLoading(true);
      try {
        const data = await getPreview(job.id, { q, page, pageSize });
        if (cancelled) return;
        const merged = data.segments.map((seg) =>
          localEdits.current[seg.segmentId] !== undefined
            ? { ...seg, translation: localEdits.current[seg.segmentId] }
            : seg,
        );
        setSegments(merged);
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
    // job.translatedSegments (not job.segments) is used as the progress signal for the
    // active path — avoids re-running on every poll tick due to new array references.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id, job.status, job.translatedSegments, q, page, isActive]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleTranslationEdit = async (segmentId: string, newValue: string) => {
    localEdits.current[segmentId] = newValue; // track locally
    setSegments((prev) =>
      prev.map((seg) =>
        seg.segmentId === segmentId
          ? { ...seg, translation: newValue, status: 'pending', validationStatus: 'pending' }
          : seg,
      ),
    );
    try {
      await updateSegmentTranslation(job.id, segmentId, newValue);
    } catch (err) {
      console.error('Failed to save translation edit:', err);
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-white/90 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="border-b border-[var(--color-line)]/60 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-[family-name:var(--font-display)] text-xl text-[var(--color-brand)]">
            {isUploaded ? 'Source Segments' : 'Translation Preview'}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
            {isUploaded
              ? `${job.totalSegments} segments ready — start translation to fill the right column`
              : `${job.targetLanguageName} translations alongside source segments${isCompleted ? ' · click any translation to edit' : ''}`}
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

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-[var(--color-paper)]/60 text-xs uppercase tracking-wider text-[var(--color-ink-soft)]">
              <th className="px-4 py-3 font-semibold w-20">ID</th>
              <th className="px-4 py-3 font-semibold w-[44%]">Source</th>
              <th className="px-4 py-3 font-semibold w-[44%]">
                <span className="flex items-center gap-1.5">
                  {isUploaded ? (
                    <span className="italic text-[var(--color-ink-soft)]/60 normal-case font-normal">
                      translation will appear here
                    </span>
                  ) : (
                    <>
                      {job.targetLanguageName}
                      {isCompleted && (
                        <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-[color-mix(in_oklab,var(--color-brand)_10%,white)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-brand)] normal-case">
                          <Pencil size={9} aria-hidden /> editable
                        </span>
                      )}
                    </>
                  )}
                </span>
              </th>
              {!isUploaded && <th className="px-4 py-3 font-semibold w-24">Status</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-line)]/50">
            {loading && (
              <tr>
                <td colSpan={isUploaded ? 3 : 4} className="px-4 py-10 text-center text-sm text-[var(--color-ink-soft)]">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-brand)]/30 border-t-[var(--color-brand)]" />
                    Loading segments…
                  </span>
                </td>
              </tr>
            )}
            {!loading && segments.length === 0 && (
              <tr>
                <td colSpan={isUploaded ? 3 : 4} className="px-4 py-10 text-center text-sm text-[var(--color-ink-soft)]">
                  No segments to display.
                </td>
              </tr>
            )}
            {!loading && segments.map((seg, idx) => {
              const translationValue = seg.translation;
              return (
                <tr
                  key={seg.segmentId}
                  className={[
                    'align-top transition-colors',
                    idx % 2 === 0 ? 'bg-white' : 'bg-[var(--color-paper)]/30',
                    'hover:bg-[color-mix(in_oklab,var(--color-brand)_2%,white)]',
                  ].join(' ')}
                >
                  {/* ID */}
                  <td className="px-4 py-3.5 font-mono text-xs text-[var(--color-brand)] align-top pt-4">
                    {seg.segmentId}
                  </td>

                  {/* Source — always read-only */}
                  <td className="px-4 py-3.5 text-[var(--color-ink)] leading-relaxed align-top">
                    <EditableCell
                      value={seg.original}
                      editable={false}
                      onChange={() => undefined}
                    />
                  </td>

                  {/* Translation — empty placeholder when uploaded, editable when completed */}
                  <td className="px-4 py-3.5 align-top">
                    {isUploaded ? (
                      <span className="block rounded-lg bg-[var(--color-paper)]/60 px-2.5 py-1.5 text-xs text-[var(--color-ink-soft)]/40 italic min-h-[2rem]">
                        —
                      </span>
                    ) : (
                      <EditableCell
                        value={translationValue}
                        placeholder={isActive ? 'translating…' : 'pending'}
                        editable={isCompleted}
                        onChange={(v) => handleTranslationEdit(seg.segmentId, v)}
                      />
                    )}
                  </td>

                  {/* Status — hidden when just uploaded */}
                  {!isUploaded && (
                    <td className="px-4 py-3.5 align-top pt-4">
                      <StatusPill status={seg.validationStatus || seg.status} />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer pagination */}
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
          {/* <a
            href={getDownloadUrl(job.id)}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand)] px-5 py-2.5 text-sm font-semibold text-white no-underline shadow-sm transition-all hover:bg-[var(--color-brand-light)] hover:shadow-md active:scale-95"
          >
            <Download size={15} aria-hidden />
            Download {job.targetLanguageName} XLIFF
          </a> */}

          <a
            href={getDownloadSourceUrl(job.id)}
            title="XLIFF with translated text written into source elements — no target elements"
             className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand)] px-5 py-2.5 text-sm font-semibold text-white no-underline shadow-sm transition-all hover:bg-[var(--color-brand-light)] hover:shadow-md active:scale-95"
          >
            <Download size={15} aria-hidden />
            Download {job.targetLanguageName} XLIFF
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
