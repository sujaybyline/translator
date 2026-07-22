import { useEffect, useRef, useState } from 'react';
import { getJob } from '../services/api';
import type { TranslationJob } from '../types';

const TERMINAL = new Set(['completed', 'failed']);

/** Poll job status — slower interval to avoid flooding the backend during long jobs */
export function useJobPolling(jobId: string | null, intervalMs = 5000) {
  const [job, setJob] = useState<TranslationJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      return;
    }

    let cancelled = false;

    const tick = async () => {
      try {
        const data = await getJob(jobId);
        if (cancelled) return;
        setJob(data);
        setError(null);
        if (!TERMINAL.has(data.status)) {
          timer.current = window.setTimeout(tick, intervalMs);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load job');
        timer.current = window.setTimeout(tick, intervalMs * 2);
      }
    };

    void tick();

    return () => {
      cancelled = true;
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [jobId, intervalMs]);

  return { job, error, setJob };
}
