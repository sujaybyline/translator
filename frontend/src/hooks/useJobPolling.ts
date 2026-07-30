import { useEffect, useRef, useState } from 'react';
import { getJob } from '../services/api';
import type { TranslationJob } from '../types';

const TERMINAL = new Set(['completed', 'failed', 'processing']);

// Max back-off: 60 s — prevents the interval growing unboundedly on persistent errors
const MAX_ERROR_INTERVAL_MS = 60_000;

/** Poll job status — slower interval to avoid flooding the backend during long jobs */
export function useJobPolling(jobId: string | null, intervalMs = 5000) {
  const [job, setJob] = useState<TranslationJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const errorIntervalRef = useRef(intervalMs);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      errorIntervalRef.current = intervalMs;
      return;
    }

    let cancelled = false;

    const tick = async () => {
      try {
        const data = await getJob(jobId);
        if (cancelled) return;
        setJob(data);
        setError(null);
        errorIntervalRef.current = intervalMs; // reset back-off on success
        if (!TERMINAL.has(data.status)) {
          timer.current = window.setTimeout(tick, intervalMs);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load job');
        // Double the interval on error, capped at MAX_ERROR_INTERVAL_MS
        errorIntervalRef.current = Math.min(errorIntervalRef.current * 2, MAX_ERROR_INTERVAL_MS);
        timer.current = window.setTimeout(tick, errorIntervalRef.current);
      }
    };

    void tick();

    return () => {
      cancelled = true;
      errorIntervalRef.current = intervalMs;
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [jobId, intervalMs]);

  return { job, error, setJob };
}
