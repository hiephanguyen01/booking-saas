import type { FavoriteRefsResponse, FavoriteTargetKind } from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useFetchers, useSubmit } from 'react-router';
import { NsI18n, useTranslation } from '../../lib/i18n';
import { storefrontPaths } from '../../lib/locale-paths';
import { LoginRequiredDialog } from './components/login-required-dialog';

interface FavoritesContextValue {
  isAuthenticated: boolean;
  locale: Locale;
  has: (kind: FavoriteTargetKind, id: string) => boolean;
  toggle: (kind: FavoriteTargetKind, id: string) => void;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

function useFavoritesContext(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorite must be used within a <FavoritesProvider>');
  return ctx;
}

const keyOf = (kind: FavoriteTargetKind, id: string) => `${kind}:${id}`;
const DEBOUNCE_MS = 350;
const ERROR_TOAST_MS = 4000;

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

/**
 * Owns favorite state, optimism, debounce, and the write for the whole tenant
 * subtree. Because the provider is mounted at the locale layout (stable across
 * page navigation), a debounced write is NOT lost when the card that triggered
 * it unmounts — the timer and the write both live here, not in the card.
 *
 * Writes for the same target are serialized. A rapid second toggle is kept as
 * the latest queued intent until the active request completes, preventing
 * add/remove requests from reaching the server out of order. Every action also
 * echoes a client mutation id so persisted fetcher data from an older request
 * cannot be mistaken for the completion of a newer one.
 */
export function FavoritesProvider({
  isAuthenticated,
  refs,
  locale,
  children,
}: {
  isAuthenticated: boolean;
  refs: FavoriteRefsResponse;
  locale: Locale;
  children: ReactNode;
}) {
  const { t } = useTranslation(NsI18n.Account);
  const [loginOpen, setLoginOpen] = useState(false);
  const [writeError, setWriteError] = useState(false);
  const [overrides, setOverrides] = useState<Map<string, boolean>>(() => new Map());
  const submit = useSubmit();
  const fetchers = useFetchers();
  const pending = useRef(new Map<string, PendingWrite>());
  const inFlight = useRef(new Map<string, FavoriteWrite>());
  const mutationSequence = useRef(0);

  const serverSet = useMemo(() => {
    const set = new Set<string>();
    for (const id of refs.listingIds) set.add(keyOf('listing', id));
    for (const id of refs.groupIds) set.add(keyOf('group', id));
    return set;
  }, [refs]);

  // Drop an optimistic override once the (revalidated) server refs agree with it.
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

  // Latest reads for stable callbacks (avoids stale closures + re-creation).
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

  // Reconcile only the response correlated to the active mutation. When a newer
  // desired state is queued, start it after the active request settles instead
  // of allowing same-target mutations to race at the backend.
  useEffect(() => {
    for (const fetcher of fetchers) {
      if (fetcher.state !== 'idle' || fetcher.data == null) continue;
      const key = fetcher.key;
      const active = inFlight.current.get(key);
      if (!active) continue;

      const result = fetcher.data as FavoriteActionResult;
      if (result.clientMutationId !== active.mutationId) continue;

      inFlight.current.delete(key);
      const queued = pending.current.get(key);
      const rejected = result.ok === false;

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

  // Flush a debounced write on teardown only when that target has no active
  // request. Starting a second same-target request here would reintroduce the
  // server ordering race this queue is designed to prevent.
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

  // Auto-dismiss the write-error toast.
  useEffect(() => {
    if (!writeError) return;
    const timer = setTimeout(() => setWriteError(false), ERROR_TOAST_MS);
    return () => clearTimeout(timer);
  }, [writeError]);

  const value = useMemo<FavoritesContextValue>(
    () => ({ isAuthenticated, locale, has, toggle }),
    [isAuthenticated, locale, has, toggle],
  );

  return (
    <FavoritesContext.Provider value={value}>
      {children}
      <LoginRequiredDialog open={loginOpen} onOpenChange={setLoginOpen} locale={locale} />
      {writeError ? (
        <div
          role="alert"
          className="fixed inset-x-0 bottom-4 z-50 mx-auto w-fit max-w-[90vw] rounded-md bg-destructive px-4 py-2 text-center text-sm text-destructive-foreground shadow-lg"
        >
          {t('favorites.saveError')}
        </div>
      ) : null}
    </FavoritesContext.Provider>
  );
}

/** Heart state + toggle for one target. Optimistic + debounced (see provider). */
export function useFavorite(
  kind: FavoriteTargetKind,
  id: string,
): { selected: boolean; toggle: () => void } {
  const { has, toggle } = useFavoritesContext();
  return { selected: has(kind, id), toggle: () => toggle(kind, id) };
}
