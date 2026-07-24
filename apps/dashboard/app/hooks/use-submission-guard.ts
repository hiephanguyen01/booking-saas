import * as React from 'react';
import { createSubmissionLock } from '@booking/ui/lib/submission-lock';

type SubmissionState = 'idle' | 'loading' | 'submitting';

/**
 * Closes the event-to-render gap for imperative submissions. The external state
 * still owns the visible request lifecycle; this hook only guarantees one
 * submission can start before that state renders.
 */
export function useSubmissionGuard(state: SubmissionState) {
  const lockRef = React.useRef(createSubmissionLock());
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
    if (!lockRef.current.tryAcquire()) return false;

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
