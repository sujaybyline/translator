import { useRef, useState } from 'react';
import { UploadZone } from '../components/UploadZone';
import { FileMetaCard } from '../components/FileMetaCard';
import { ProgressPanel } from '../components/ProgressPanel';
import { CompletionCard, PreviewTable } from '../components/PreviewTable';
import { useJobPolling } from '../hooks/useJobPolling';
import { clearJob, startTranslation, uploadXliff } from '../services/api';
import type { TranslationJob } from '../types';

export function TranslatorPage() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [localJob, setLocalJob] = useState<TranslationJob | null>(null);
  const [uploading, setUploading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const startInFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const { job: polledJob } = useJobPolling(jobId);

  const job = polledJob ?? localJob;

  const onFile = async (file: File) => {
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
    setClearing(true);
    setError(null);
    try {
      await clearJob(job.id);
      setJobId(null);
      setLocalJob(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear upload');
    } finally {
      setClearing(false);
    }
  };

  const onStart = async () => {
    if (!job || startInFlight.current) return;
    startInFlight.current = true;
    setStarting(true);
    setError(null);
    try {
      const updated = await startTranslation(job.id);
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
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[1.75rem] border border-[var(--color-line)] bg-[linear-gradient(145deg,#0f3d3e_0%,#1a5c5e_55%,#0c2f30_100%)] px-6 py-12 text-white shadow-sm sm:px-10">
        <div
          className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full opacity-30 blur-2xl"
          style={{ background: '#c4a35a' }}
        />
        <div
          className="pointer-events-none absolute bottom-0 left-1/3 h-40 w-72 opacity-20"
          style={{
            backgroundImage:
              'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
            backgroundSize: '16px 16px',
          }}
        />
        <p className="relative text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-accent-soft)]">
          Localization for TTS workflows
        </p>
        <h1 className="relative mt-3 max-w-3xl font-[family-name:var(--font-display)] text-4xl leading-tight sm:text-5xl">
          Translate Your XLIFF Files with AI
        </h1>
        <p className="relative mt-4 max-w-2xl text-base text-white/80 sm:text-lg">
          Upload an XLIFF file and translate its content into German while preserving the original
          XLIFF structure.
        </p>
      </section>

      <UploadZone disabled={uploading} onFile={onFile} />

      {uploading && (
        <p className="text-sm text-[var(--color-ink-soft)]">Uploading and parsing XLIFF…</p>
      )}

      {error && (
        <p className="rounded-xl bg-[color-mix(in_oklab,var(--color-danger)_12%,white)] px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      {job && (
        <div className="space-y-6">
          <FileMetaCard
            job={job}
            onStart={onStart}
            onClear={onClear}
            starting={starting}
            clearing={clearing}
          />
          <ProgressPanel job={job} />
          <CompletionCard job={job} />
          {(job.status === 'completed' ||
            job.status === 'translating' ||
            job.translatedSegments > 0) && <PreviewTable job={job} />}
        </div>
      )}
    </div>
  );
}
