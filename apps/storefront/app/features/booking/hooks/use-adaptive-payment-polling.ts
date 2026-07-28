import { useEffect, useRef } from 'react';
import { paymentPollDelay, runPaymentPollLoad } from '~/lib/payment-polling';

const BUSY_RETRY_DELAY_MS = 1_000;

interface AdaptivePaymentPollingOptions {
  enabled: boolean;
  href: string;
  load: (href: string) => void | Promise<void>;
  state: 'idle' | 'loading' | 'submitting';
}

/**
 * Poll a lightweight payment-status resource aggressively for the first few
 * seconds, then back off for unusually long pending gateway flows. Polling is
 * paused while the tab is hidden and resumes with one immediate refresh.
 */
export function useAdaptivePaymentPolling({
  enabled,
  href,
  load,
  state,
}: AdaptivePaymentPollingOptions): void {
  const loadRef = useRef(load);
  loadRef.current = load;
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let inFlight = false;
    let attempt = 0;
    let timer: number | undefined;

    const clearTimer = () => {
      if (timer === undefined) return;
      window.clearTimeout(timer);
      timer = undefined;
    };

    const schedule = (delay: number) => {
      clearTimer();
      if (cancelled || document.visibilityState !== 'visible') return;
      timer = window.setTimeout(() => void poll(), delay);
    };

    async function poll(): Promise<void> {
      if (cancelled || document.visibilityState !== 'visible') return;
      if (inFlight || stateRef.current !== 'idle') {
        schedule(BUSY_RETRY_DELAY_MS);
        return;
      }

      inFlight = true;
      try {
        await runPaymentPollLoad(loadRef.current, href);
        attempt += 1;
      } finally {
        inFlight = false;
        if (!cancelled) schedule(paymentPollDelay(attempt));
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        clearTimer();
        return;
      }

      // The user may have completed payment in another tab/app. Refresh now,
      // then restart with the responsive part of the polling curve.
      attempt = 0;
      void poll();
    };

    schedule(paymentPollDelay(attempt));
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      cancelled = true;
      clearTimer();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, href]);
}
