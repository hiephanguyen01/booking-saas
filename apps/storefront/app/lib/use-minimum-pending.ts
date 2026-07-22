import { useCallback, useEffect, useRef, useState } from 'react';

export const MINIMUM_SKELETON_MS = 250;

/**
 * Keeps an already-visible pending surface mounted long enough to read as an
 * intentional transition instead of a single-frame flash.
 */
export function useMinimumPending(
  active: boolean,
  minimumMs = MINIMUM_SKELETON_MS,
): boolean {
  const [minimumVisible, setMinimumVisible] = useState(false);
  const visibleSince = useRef<number | null>(null);

  useEffect(() => {
    if (active) {
      if (visibleSince.current === null) visibleSince.current = Date.now();
      setMinimumVisible(true);
      return;
    }

    if (!minimumVisible || visibleSince.current === null) return;

    const remaining = Math.max(minimumMs - (Date.now() - visibleSince.current), 0);
    const timeout = window.setTimeout(() => {
      visibleSince.current = null;
      setMinimumVisible(false);
    }, remaining);

    return () => window.clearTimeout(timeout);
  }, [active, minimumMs, minimumVisible]);

  return active || minimumVisible;
}

export function isReadNavigationMethod(method: string | undefined): boolean {
  return method === undefined || method.toLowerCase() === 'get';
}

/**
 * Creates a minimum-duration pending pulse for synchronous client transitions.
 * Repeated triggers extend one continuous pending state from the latest trigger.
 */
export function useMinimumPendingPulse(
  minimumMs = MINIMUM_SKELETON_MS,
): readonly [pending: boolean, trigger: () => void] {
  const [pending, setPending] = useState(false);
  const timeout = useRef<number | null>(null);

  const trigger = useCallback(() => {
    if (timeout.current !== null) window.clearTimeout(timeout.current);
    setPending(true);
    timeout.current = window.setTimeout(() => {
      timeout.current = null;
      setPending(false);
    }, minimumMs);
  }, [minimumMs]);

  useEffect(
    () => () => {
      if (timeout.current !== null) window.clearTimeout(timeout.current);
    },
    [],
  );

  return [pending, trigger] as const;
}
