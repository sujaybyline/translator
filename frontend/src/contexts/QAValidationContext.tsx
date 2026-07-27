import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getRunningQAJobs, cancelQAJob } from '../services/api';
import type { QASegmentResult } from '../types';

interface QAValidationState {
  jobId: string | null;
  running: boolean;
  error: string | null;
  validatedSegments: QASegmentResult[];
  progress: { reviewed: number; total: number };
  mode: 'compare' | 'review' | null;
}

interface QAValidationContextValue {
  state: QAValidationState;
  startValidation: (jobId: string, mode: 'compare' | 'review', abortController: AbortController) => Promise<void>;
  cancelValidation: () => Promise<void>;
  updateProgress: (segments: QASegmentResult[], reviewed: number, total: number) => void;
  clearValidation: () => void;
  registerAbortController: (controller: AbortController) => void;
}

const QAValidationContext = createContext<QAValidationContextValue | undefined>(undefined);

const initialState: QAValidationState = {
  jobId: null,
  running: false,
  error: null,
  validatedSegments: [],
  progress: { reviewed: 0, total: 0 },
  mode: null,
};

export function QAValidationProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<QAValidationState>(initialState);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pollingIntervalRef = useRef<number | null>(null);
  const shouldPollRef = useRef(false);

  // Clean up function to abort and clear everything
  const cleanup = useCallback(async () => {
    // Abort any ongoing SSE/fetch request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Clear polling interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    
    // Cancel server job if exists
    if (state.jobId) {
      try {
        await cancelQAJob(state.jobId);
      } catch (err) {
        console.error('Failed to cancel server job:', err);
      }
    }
    
    // Reset state
    setState(initialState);
  }, [state.jobId]);

  // Check for running jobs on mount
  useEffect(() => {
    const checkRunningJobs = async () => {
      try {
        const runningJobs = await getRunningQAJobs();
        if (runningJobs.length > 0) {
          const latestJob = runningJobs[0];
          // Only restore if it matches our current job ID or we have no job ID
          if (latestJob.status === 'running' && (!state.jobId || latestJob.id === state.jobId)) {
            if (!state.running) {
              // Found a running job that we weren't tracking - restore it
              setState({
                jobId: latestJob.id,
                running: true,
                error: 'Validation is in progress on the server. Segments validated so far are shown below.',
                validatedSegments: latestJob.segments,
                progress: { reviewed: latestJob.reviewed_segments, total: latestJob.total_segments },
                mode: latestJob.mode,
              });
            }
          } else if (latestJob.status === 'completed' && state.running && latestJob.id === state.jobId) {
            // Job completed while we were tracking it
            setState({
              ...state,
              running: false,
              error: null,
              validatedSegments: latestJob.segments,
              progress: { reviewed: latestJob.reviewed_segments, total: latestJob.total_segments },
            });
          } else if (latestJob.status === 'cancelled' && state.running && latestJob.id === state.jobId) {
            // Job was cancelled
            setState(initialState);
          } else if (latestJob.status === 'running' && state.running && latestJob.id === state.jobId) {
            // Job is still running and we're tracking it - check if progress is complete
            if (latestJob.reviewed_segments >= latestJob.total_segments && latestJob.total_segments > 0) {
              // Progress is complete but status still shows running - mark as completed
              setState({
                ...state,
                running: false,
                error: null,
                validatedSegments: latestJob.segments,
                progress: { reviewed: latestJob.reviewed_segments, total: latestJob.total_segments },
              });
            }
          }
        } else if (state.running) {
          // No running jobs but we thought one was running - clear state
          setState(initialState);
        }
      } catch (err) {
        console.error('Failed to check running QA jobs:', err);
      }
    };

    checkRunningJobs();
  }, []); // Run only once on mount

  // Start/stop polling based on running state
  useEffect(() => {
    const checkRunningJobs = async () => {
      // Check if we should still be polling
      if (!shouldPollRef.current) {
        return;
      }

      try {
        const runningJobs = await getRunningQAJobs();
        if (!runningJobs || !Array.isArray(runningJobs)) {
          if (state.running) {
            shouldPollRef.current = false;
            setState(initialState);
          }
          return;
        }

        if (runningJobs.length > 0) {
          const latestJob = runningJobs[0];
          if (latestJob.status === 'completed' && state.running && latestJob.id === state.jobId) {
            // Job completed - stop polling
            shouldPollRef.current = false;
            setState({
              ...state,
              running: false,
              error: null,
              validatedSegments: latestJob.segments,
              progress: { reviewed: latestJob.reviewed_segments, total: latestJob.total_segments },
            });
          } else if (latestJob.status === 'cancelled' && state.running && latestJob.id === state.jobId) {
            // Job cancelled - stop polling
            shouldPollRef.current = false;
            setState(initialState);
          } else if (latestJob.status === 'running' && state.running && latestJob.id === state.jobId) {
            // Check if progress is complete - force stop if 100%
            if (latestJob.reviewed_segments >= latestJob.total_segments && latestJob.total_segments > 0) {
              shouldPollRef.current = false;
              // Progress complete - stop polling
              setState({
                ...state,
                running: false,
                error: null,
                validatedSegments: latestJob.segments,
                progress: { reviewed: latestJob.reviewed_segments, total: latestJob.total_segments },
              });
            }
          }
        } else if (state.running) {
          // No running jobs - stop polling
          shouldPollRef.current = false;
          setState(initialState);
        }
      } catch (err) {
        console.error('Failed to check running QA jobs:', err);
        // Stop polling on error to prevent infinite error loop
        shouldPollRef.current = false;
        if (state.running) {
          setState(initialState);
        }
      }
    };

    if (state.running) {
      shouldPollRef.current = true;
      pollingIntervalRef.current = setInterval(() => {
        checkRunningJobs();
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

  const startValidation = useCallback(async (jobId: string, mode: 'compare' | 'review', abortController: AbortController) => {
    // Cancel any existing validation before starting a new one
    if (state.running || state.jobId) {
      await cleanup();
    }
    
    // Register the new abort controller
    abortControllerRef.current = abortController;
    
    // Start the new validation
    setState({
      jobId,
      running: true,
      error: null,
      validatedSegments: [],
      progress: { reviewed: 0, total: 0 },
      mode,
    });
  }, [state.running, state.jobId, cleanup]);

  const cancelValidation = useCallback(async () => {
    await cleanup();
  }, [cleanup]);

  const updateProgress = useCallback((segments: QASegmentResult[], reviewed: number, total: number) => {
    // Only update progress if we're still tracking the same job
    setState((prev) => ({
      ...prev,
      validatedSegments: [...prev.validatedSegments, ...segments],
      progress: { reviewed, total },
    }));
  }, []);

  const clearValidation = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const registerAbortController = useCallback((controller: AbortController) => {
    abortControllerRef.current = controller;
  }, []);

  const value: QAValidationContextValue = {
    state,
    startValidation,
    cancelValidation,
    updateProgress,
    clearValidation,
    registerAbortController,
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
