import type { FavoriteRefsResponse, FavoriteTargetKind } from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFetchers, useSubmit } from 'react-router';
import { storefrontPaths } from '~/constants/paths';

const DEBOUNCE_MS = 350;
const ERROR_TOAST_MS = 4000;

const keyOf = (kind: FavoriteTargetKind, id: string) => `${kind}:${id}`;

interface FavoriteWrite {
  kind: FavoriteTargetKind;
  id: string;
  desired: boolean;
  mutationId: string;
}

interface PendingWrite extends FavoriteWrite {
  timer: ReturnType<typeof setTimeout> | null;
}

interface FavoriteActionResult {
  ok?: boolean;
  clientMutationId?: string | null;
}

export function useFavoritesController({
  isAuthenticated,
  refs,
  locale,
}: {
  isAuthenticated: boolean;
  refs: FavoriteRefsResponse;
  locale: Locale;
}) {
  const [loginOpen, setLoginOpen] = useState(false);
  const [writeError, setWriteError] = useState(false);
  const [overrides, setOverrides] = useState<Map<string, boolean>>(() => new Map());
  const submit = useSubmit();
  const fetchers = useFetchers();
  const pending = useRef(new Map<string, PendingWrite>());
  const inFlight = useRef(new Map<string, FavoriteWrite>());
  const mutationSequence = useRef(0);

  // Keyed on the id arrays, not on `refs`: the locale layout revalidates after every
  // navigation and every action, so the wrapper object is fresh even when the ids
  // are not — and a new Set here re-renders every heart on the page.
  const serverSet = useMemo(() => {
    const set = new Set<string>();
    for (const id of refs.listingIds) set.add(keyOf('listing', id));
    for (const id of refs.groupIds) set.add(keyOf('group', id));
    return set;
  }, [refs.listingIds, refs.groupIds]);

  useEffect(() => {
    setOverrides((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Map(prev);
      for (const [key, desired] of prev) {
        if (serverSet.has(key) === desired) {
          next.delete(key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [serverSet]);

  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;
  const serverSetRef = useRef(serverSet);
  serverSetRef.current = serverSet;
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const submitRef = useRef(submit);
  submitRef.current = submit;

  const sendToggle = useCallback((write: FavoriteWrite) => {
    const key = keyOf(write.kind, write.id);
    inFlight.current.set(key, write);
    submitRef.current(
      {
        intent: write.desired ? 'add' : 'remove',
        target: write.kind,
        targetId: write.id,
        clientMutationId: write.mutationId,
      },
      {
        method: 'post',
        action: storefrontPaths.favoritesToggle(localeRef.current),
        navigate: false,
        fetcherKey: key,
      },
    );
  }, []);

  const flushPending = useCallback(
    (key: string): void => {
      if (inFlight.current.has(key)) return;
      const write = pending.current.get(key);
      if (!write) return;

      if (write.timer) clearTimeout(write.timer);
      pending.current.delete(key);
      sendToggle(write);
    },
    [sendToggle],
  );

  useEffect(() => {
    for (const fetcher of fetchers) {
      if (fetcher.state !== 'idle') continue;
      const key = fetcher.key;
      const active = inFlight.current.get(key);
      if (!active) continue;

      const result =
        fetcher.data && typeof fetcher.data === 'object'
          ? (fetcher.data as FavoriteActionResult)
          : null;
      // Fetcher data may be empty after a route/network failure or may still hold
      // the previous submission's result. Either case settles the current write as
      // rejected; leaving it in `inFlight` would block every later toggle for this key.
      const rejected = result?.clientMutationId !== active.mutationId || result.ok !== true;

      inFlight.current.delete(key);
      const queued = pending.current.get(key);

      if (rejected && !queued) {
        setOverrides((prev) => {
          if (prev.get(key) !== active.desired) return prev;
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
        setWriteError(true);
      }

      flushPending(key);
    }
  }, [fetchers, flushPending]);

  const has = useCallback(
    (kind: FavoriteTargetKind, id: string) => {
      const key = keyOf(kind, id);
      return overrides.has(key) ? (overrides.get(key) as boolean) : serverSet.has(key);
    },
    [overrides, serverSet],
  );

  const toggle = useCallback(
    (kind: FavoriteTargetKind, id: string) => {
      if (!isAuthenticated) {
        setLoginOpen(true);
        return;
      }

      const key = keyOf(kind, id);
      const current = overridesRef.current.has(key)
        ? (overridesRef.current.get(key) as boolean)
        : serverSetRef.current.has(key);
      const desired = !current;
      const mutationId = `${Date.now().toString(36)}-${(++mutationSequence.current).toString(36)}`;
      setOverrides((prev) => new Map(prev).set(key, desired));

      const existing = pending.current.get(key);
      if (existing?.timer) clearTimeout(existing.timer);

      const write: PendingWrite = {
        kind,
        id,
        desired,
        mutationId,
        timer: null,
      };
      write.timer = setTimeout(() => {
        const latest = pending.current.get(key);
        if (!latest || latest.mutationId !== mutationId) return;
        latest.timer = null;
        flushPending(key);
      }, DEBOUNCE_MS);
      pending.current.set(key, write);
    },
    [flushPending, isAuthenticated],
  );

  useEffect(() => {
    const pendingWrites = pending.current;
    const activeWrites = inFlight.current;
    return () => {
      for (const [key, write] of pendingWrites) {
        if (write.timer) clearTimeout(write.timer);
        if (!activeWrites.has(key)) sendToggle(write);
      }
      pendingWrites.clear();
    };
  }, [sendToggle]);

  useEffect(() => {
    if (!writeError) return;
    const timer = setTimeout(() => setWriteError(false), ERROR_TOAST_MS);
    return () => clearTimeout(timer);
  }, [writeError]);

  return {
    has,
    toggle,
    loginOpen,
    setLoginOpen,
    writeError,
  };
}
