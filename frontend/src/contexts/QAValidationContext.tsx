// Bug 4 — Server restart bricks all in-progress jobs

// If you deploy a new version or the server crashes mid-job, every job that was running stays running in the DB forever. Every user who had a job in progress sees the permanent spinning indicator and can never start a new QA job because the UI thinks one is already running. The only fix is a manual DB update.

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getRunningQAJobs, cancelQAJob } from '../services/api';
import type { QASegmentResult, QAResult } from '../types';

interface QAValidationState {
  jobId: string | null;
  running: boolean;
  error: string | null;
  validatedSegments: QASegmentResult[];
  progress: { reviewed: number; total: number };
  mode: 'compare' | 'review' | null;
  result: QAResult | null;
}

interface QAValidationContextValue {
  state: QAValidationState;
  startValidation: (jobId: string, mode: 'compare' | 'review', abortController: AbortController) => Promise<void>;
  cancelValidation: () => Promise<void>;
  updateProgress: (segments: QASegmentResult[], reviewed: number, total: number) => void;
  clearValidation: () => void;
  registerAbortController: (controller: AbortController) => void;
  markSseComplete: (result: QAResult | null) => void;
  updateJobId: (jobId: string) => void;
}

const QAValidationContext = createContext<QAValidationContextValue | undefined>(undefined);

const initialState: QAValidationState = {
  jobId: null,
  running: false,
  error: null,
  validatedSegments: [],
  progress: { reviewed: 0, total: 0 },
  mode: null,
  result: null,
};

export function QAValidationProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<QAValidationState>(initialState);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pollingIntervalRef = useRef<number | null>(null);
  const shouldPollRef = useRef(false);

  // FIX #1: Track jobId in a ref so cleanup never closes over stale state.
  const jobIdRef = useRef<string | null>(null);
  // FIX #7/8: Track whether SSE is actively running to skip redundant polling.
  const sseActiveRef = useRef(false);

  // Keep jobIdRef in sync with state
  useEffect(() => {
    jobIdRef.current = state.jobId;
  }, [state.jobId]);

  // Clean up function — uses jobIdRef instead of closing over state.jobId
  const cleanup = useCallback(async () => {
    // Abort any ongoing SSE/fetch request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    sseActiveRef.current = false;

    // Clear polling interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    // Cancel server job using the ref — never stale regardless of when cleanup is called
    const currentJobId = jobIdRef.current;
    if (currentJobId) {
      try {
        await cancelQAJob(currentJobId);
      } catch (err) {
        console.error('Failed to cancel server job:', err);
      }
    }

    // Reset state
    setState((prev) => ({ ...initialState, result: prev.result }));
  }, []); // no deps — reads from refs, not state

  // Check for running jobs on mount — restore any job that was running before page load
  useEffect(() => {
    const checkRunningJobs = async () => {
      try {
        const runningJobs = await getRunningQAJobs();
        if (runningJobs.length === 0) return;

        const latestJob = runningJobs[0];

        // FIX #2: use functional setState so we read current state, not stale closure
        setState((prev) => {
          if (latestJob.status === 'running' && (!prev.jobId || latestJob.id === prev.jobId)) {
            if (!prev.running) {
              return {
                ...prev,
                jobId: latestJob.id,
                running: true,
                error: 'Validation is in progress on the server. Segments validated so far are shown below.',
                validatedSegments: latestJob.segments,
                progress: { reviewed: latestJob.reviewed_segments, total: latestJob.total_segments },
                mode: latestJob.mode,
              };
            }
          } else if (
            latestJob.status === 'completed' &&
            prev.running &&
            latestJob.id === prev.jobId
          ) {
            return {
              ...prev,
              running: false,
              error: null,
              validatedSegments: latestJob.segments,
              progress: { reviewed: latestJob.reviewed_segments, total: latestJob.total_segments },
            };
          } else if (
            latestJob.status === 'cancelled' &&
            prev.running &&
            latestJob.id === prev.jobId
          ) {
            return { ...initialState, result: prev.result };
          } else if (
            latestJob.status === 'running' &&
            prev.running &&
            latestJob.id === prev.jobId &&
            latestJob.reviewed_segments >= latestJob.total_segments &&
            latestJob.total_segments > 0
          ) {
            return {
              ...prev,
              running: false,
              error: null,
              validatedSegments: latestJob.segments,
              progress: { reviewed: latestJob.reviewed_segments, total: latestJob.total_segments },
            };
          }
          return prev; // no change
        });
      } catch (err) {
        console.error('Failed to check running QA jobs:', err);
      }
    };

    void checkRunningJobs();
  }, []); // run once on mount

  // Start/stop polling based on running state
  // FIX #7/8: skip the DB poll entirely while SSE is live (sseActiveRef.current = true)
  useEffect(() => {
    const checkRunningJobs = async () => {
      if (!shouldPollRef.current) return;
      // Skip redundant polling while SSE is actively streaming
      if (sseActiveRef.current) return;

      try {
        const runningJobs = await getRunningQAJobs();
        if (!runningJobs || !Array.isArray(runningJobs)) {
          // FIX #2: functional update — no stale closure on state
          setState((prev) => {
            if (prev.running) {
              shouldPollRef.current = false;
              return { ...initialState, result: prev.result };
            }
            return prev;
          });
          return;
        }

        if (runningJobs.length > 0) {
          const latestJob = runningJobs[0];
          // FIX #2: functional setState throughout
          setState((prev) => {
            if (!prev.running || latestJob.id !== prev.jobId) return prev;

            if (latestJob.status === 'completed') {
              shouldPollRef.current = false;
              return {
                ...prev,
                running: false,
                error: null,
                validatedSegments: latestJob.segments,
                progress: { reviewed: latestJob.reviewed_segments, total: latestJob.total_segments },
              };
            }
            if (latestJob.status === 'cancelled') {
              shouldPollRef.current = false;
              return { ...initialState, result: prev.result };
            }
            if (
              latestJob.status === 'running' &&
              latestJob.reviewed_segments >= latestJob.total_segments &&
              latestJob.total_segments > 0
            ) {
              shouldPollRef.current = false;
              return {
                ...prev,
                running: false,
                error: null,
                validatedSegments: latestJob.segments,
                progress: { reviewed: latestJob.reviewed_segments, total: latestJob.total_segments },
              };
            }
            return prev;
          });
        } else {
          setState((prev) => {
            if (prev.running) {
              shouldPollRef.current = false;
              return { ...initialState, result: prev.result };
            }
            return prev;
          });
        }
      } catch (err) {
        console.error('Failed to check running QA jobs:', err);
        shouldPollRef.current = false;
        setState((prev) => (prev.running ? { ...initialState, result: prev.result } : prev));
      }
    };

    if (state.running) {
      shouldPollRef.current = true;
      pollingIntervalRef.current = setInterval(() => {
        void checkRunningJobs();
      }, 2000);
    } else {
      shouldPollRef.current = false;
    }

    return () => {
      shouldPollRef.current = false;
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [state.running, state.jobId]);

  const startValidation = useCallback(async (
    jobId: string,
    mode: 'compare' | 'review',
    abortController: AbortController,
  ) => {
    // Cancel any existing validation before starting a new one
    if (jobIdRef.current || state.running) {
      await cleanup();
    }

    // Mark SSE as active so polling skips until SSE finishes
    sseActiveRef.current = true;
    abortControllerRef.current = abortController;

    setState({
      jobId,
      running: true,
      error: null,
      validatedSegments: [],
      progress: { reviewed: 0, total: 0 },
      mode,
      result: null,
    });
  }, [state.running, cleanup]);

  const cancelValidation = useCallback(async () => {
    await cleanup();
  }, [cleanup]);

  const updateProgress = useCallback((segments: QASegmentResult[], reviewed: number, total: number) => {
    setState((prev) => ({
      ...prev,
      validatedSegments: [
        ...prev.validatedSegments,
        ...segments.filter(
          (s) => !prev.validatedSegments.some((e) => e.segmentId === s.segmentId)
        ),
      ],
      progress: { reviewed, total },
    }));
  }, []);

  // Called by QAPage when SSE stream completes (success or error) so polling resumes
  const markSseComplete = useCallback((result: QAResult | null) => {
    sseActiveRef.current = false;
    if (result) {
      setState((prev) => ({ ...prev, result }));
    }
  }, []);

  const clearValidation = useCallback(() => {
    void cleanup();
  }, [cleanup]);

  const registerAbortController = useCallback((controller: AbortController) => {
    abortControllerRef.current = controller;
  }, []);

  const updateJobId = useCallback((jobId: string) => {
    jobIdRef.current = jobId;
    setState((prev) => ({ ...prev, jobId }));
  }, []);

  const value: QAValidationContextValue = {
    state,
    startValidation,
    cancelValidation,
    updateProgress,
    clearValidation,
    registerAbortController,
    markSseComplete,
    updateJobId,
  };

  return <QAValidationContext.Provider value={value}>{children}</QAValidationContext.Provider>;
}

export function useQAValidation() {
  const context = useContext(QAValidationContext);
  if (context === undefined) {
    throw new Error('useQAValidation must be used within a QAValidationProvider');
  }
  return context;
}
