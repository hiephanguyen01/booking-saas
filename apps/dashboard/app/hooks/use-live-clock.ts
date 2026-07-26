import { useEffect, useState } from 'react';

/**
 * Start from a server-serialized clock so SSR and hydration agree, then keep
 * time-gated UI current after mount without requiring a route reload.
 */
export function useLiveClock(initialNow: number, intervalMs = 60_000): number {
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    setNow(initialNow);
    const update = (): void => setNow(Date.now());
    update();
    const timer = window.setInterval(update, intervalMs);
    return () => window.clearInterval(timer);
  }, [initialNow, intervalMs]);

  return now;
}
