import * as React from 'react';
import { createSubmissionLock } from '@booking/ui/lib/submission-lock';

export type SubmissionState = 'idle' | 'loading' | 'submitting';

/**
 * Closes the event-to-render gap for imperative submissions. The external state
 * still owns the visible request lifecycle; this hook guarantees only one
 * submission can start and refuses new work while that lifecycle is already busy.
 */
export function useSubmissionGuard(state: SubmissionState) {
  const lockRef = React.useRef(createSubmissionLock());
  const stateRef = React.useRef(state);
  stateRef.current = state;
  const stateWasBusyRef = React.useRef(false);
  const [locked, setLocked] = React.useState(false);
  const busy = locked || state !== 'idle';

  React.useEffect(() => {
    if (state !== 'idle') {
      stateWasBusyRef.current = true;
      return;
    }

    if (stateWasBusyRef.current) {
      stateWasBusyRef.current = false;
      lockRef.current.release();
      setLocked(false);
    }
  }, [state]);

  const run = React.useCallback((submit: () => void): boolean => {
    if (stateRef.current !== 'idle' || !lockRef.current.tryAcquire()) return false;

    setLocked(true);
    let submitted = false;
    try {
      submit();
      submitted = true;
      return true;
    } finally {
      if (!submitted) {
        lockRef.current.release();
        setLocked(false);
      }
    }
  }, []);

  return { busy, run };
}
