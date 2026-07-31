import { useEffect, useRef } from 'react';
import type { FetcherWithComponents } from 'react-router';

/** What every calendar action returns; `summary` only comes back from a range write. */
export interface SubmitResult {
  ok: boolean;
  error?: string | null;
  summary?: { created: number; skipped: { date: string; reason: string }[] } | null;
}

/**
 * Run `onSuccess` once each time a fetcher submission settles successfully.
 *
 * The dialogs post through fetchers, so their result never reaches the route's
 * `actionData` — without this the partner gets no confirmation at all and
 * re-submits. The handler is held in a ref so callers can pass an inline
 * closure without re-arming the effect on every render.
 */
export function useSubmitSuccess(
  fetcher: FetcherWithComponents<SubmitResult | undefined>,
  onSuccess: (result: SubmitResult) => void,
): void {
  const submitting = useRef(false);
  const handler = useRef(onSuccess);
  handler.current = onSuccess;
  useEffect(() => {
    if (fetcher.state !== 'idle') {
      submitting.current = true;
      return;
    }
    if (!submitting.current) return;
    submitting.current = false;
    if (fetcher.data?.ok) handler.current(fetcher.data);
  }, [fetcher.state, fetcher.data]);
}
