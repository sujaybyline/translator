import { useEffect, useRef, useState } from 'react';
import { XCircle } from 'lucide-react';
import { UploadZone } from '../components/UploadZone';
import { FileMetaCard } from '../components/FileMetaCard';
import { ProgressPanel } from '../components/ProgressPanel';
import { CompletionCard, PreviewTable } from '../components/PreviewTable';
import { useJobPolling } from '../hooks/useJobPolling';
import { clearJob, getHistory, startTranslation, uploadXliff } from '../services/api';
import type { TranslationJob } from '../types';

export function TranslatorPage() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [localJob, setLocalJob] = useState<TranslationJob | null>(null);
  const [uploading, setUploading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const startInFlight = useRef(false);
  const jobSelectionChanged = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const { job: polledJob } = useJobPolling(jobId);

  const job = polledJob ?? localJob;

  useEffect(() => {
    let cancelled = false;
    void getHistory()
      .then((jobs) => {
        if (cancelled || jobSelectionChanged.current || jobs.length === 0) return;
        const latest = jobs[0];
        setLocalJob(latest);
        setJobId(latest.id);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const onFile = async (file: File) => {
    jobSelectionChanged.current = true;
    setError(null);
    setUploading(true);
    setStarting(false);
    setClearing(false);
    startInFlight.current = false;
    setJobId(null);
    setLocalJob(null);
    try {
      const created = await uploadXliff(file);
      setLocalJob(created);
      setJobId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const onClear = async () => {
    if (!job || startInFlight.current || clearing) return;
    jobSelectionChanged.current = true;
    setClearing(true);
    setError(null);
    try {
      // Only delete from database if job is not completed
      // Completed jobs should remain in history for download
      if (job.status !== 'completed') {
        await clearJob(job.id);
      }
      setJobId(null);
      setLocalJob(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear upload');
    } finally {
      setClearing(false);
    }
  };

  const onStart = async (targetLanguage: string) => {
    if (!job || startInFlight.current) return;
    jobSelectionChanged.current = true;
    startInFlight.current = true;
    setStarting(true);
    setError(null);
    try {
      const updated = await startTranslation(job.id, targetLanguage);
      setLocalJob(updated);
      setJobId(updated.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start translation');
      setStarting(false);
    } finally {
      startInFlight.current = false;
    }
  };

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-[1.75rem] border border-[var(--color-brand)]/20 bg-[linear-gradient(145deg,#0c2f30_0%,#0f3d3e_45%,#1a5c5e_100%)] px-6 py-10 text-white shadow-lg sm:px-10">
        {/* gold glow */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full opacity-25 blur-3xl" style={{ background: '#c4a35a' }} />
        {/* second glow bottom-left */}
        <div className="pointer-events-none absolute -bottom-8 -left-8 h-48 w-48 rounded-full opacity-15 blur-2xl" style={{ background: '#c4a35a' }} />
        {/* dot grid */}
        <div
          className="pointer-events-none absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 1.5px 1.5px, white 1px, transparent 0)', backgroundSize: '20px 20px' }}
        />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-soft)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
            Localization for TTS workflows
          </span>
          <h1 className="mt-3 max-w-3xl font-[family-name:var(--font-display)] text-4xl leading-tight sm:text-5xl">
            Translate Your XLIFF Files with AI
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">
            Upload an XLIFF file and translate it into your chosen language while preserving the original structure for Text-to-Speech workflows.
          </p>
        </div>
      </section>

      <UploadZone disabled={uploading} onFile={onFile} />

      {uploading && (
        <div className="flex items-center gap-2 text-sm text-[var(--color-ink-soft)]">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-brand)]/30 border-t-[var(--color-brand)]" />
          Uploading and parsing XLIFF…
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 rounded-xl bg-[color-mix(in_oklab,var(--color-danger)_10%,white)] border border-[color-mix(in_oklab,var(--color-danger)_20%,white)] px-4 py-3 text-sm text-[var(--color-danger)]">
          <XCircle size={16} className="shrink-0" aria-hidden />
          {error}
        </div>
      )}

      {job && (
        <div className="space-y-5">
          <FileMetaCard job={job} onStart={onStart} onClear={onClear} starting={starting} clearing={clearing} />
          <ProgressPanel job={job} />
          <CompletionCard job={job} onClear={onClear} clearing={clearing} />
          {(job.status === 'uploaded' ||
            job.status === 'completed' ||
            job.status === 'translating' ||
            job.translatedSegments > 0) && (
            <PreviewTable job={job} />
          )}
        </div>
      )}
    </div>
  );
}
