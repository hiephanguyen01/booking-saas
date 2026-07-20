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

interface PendingWrite {
  kind: FavoriteTargetKind;
  id: string;
  desired: boolean;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Owns favorite state, optimism, debounce, and the write for the whole tenant
 * subtree. Because the provider is mounted at the locale layout (stable across
 * page navigation), a debounced write is NOT lost when the card that triggered
 * it unmounts — the timer and the write both live here, not in the card. When
 * the provider itself unmounts (a locale switch changes the `:locale` param),
 * any still-pending write is flushed rather than dropped. A write the server
 * rejects rolls the optimistic heart back and surfaces an error.
 *
 * Writes go through a fetcher submission (never a browser `fetch`) so they hit
 * the `favorites/toggle` action, which owns the authenticated server-to-server
 * call. Each submission is keyed by target so we can reconcile its result via
 * `useFetchers()`, and a successful submission revalidates loaders so the server
 * refs catch up and the optimistic override is dropped.
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
  // key → the desired state of the in-flight submission, so a rejected write
  // can be rolled back to the correct value.
  const inFlight = useRef(new Map<string, boolean>());

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

  // Latest reads for the stable callbacks (avoids stale closures + re-creation).
  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;
  const serverSetRef = useRef(serverSet);
  serverSetRef.current = serverSet;
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const submitRef = useRef(submit);
  submitRef.current = submit;

  // Fire the persisted write via a keyed fetcher submission. Stable so the
  // unmount flush can reuse it; navigate:false revalidates loaders on success.
  const sendToggle = useCallback((kind: FavoriteTargetKind, id: string, desired: boolean) => {
    submitRef.current(
      { intent: desired ? 'add' : 'remove', target: kind, targetId: id },
      {
        method: 'post',
        action: storefrontPaths.favoritesToggle(localeRef.current),
        navigate: false,
        fetcherKey: keyOf(kind, id),
      },
    );
  }, []);

  // Reconcile completed submissions: a server rejection rolls the optimistic
  // override back (unless a newer toggle superseded it) and warns the user.
  useEffect(() => {
    for (const fetcher of fetchers) {
      if (fetcher.state !== 'idle' || fetcher.data == null) continue;
      const key = fetcher.key;
      if (!inFlight.current.has(key)) continue;
      const desired = inFlight.current.get(key) as boolean;
      inFlight.current.delete(key);
      const rejected = (fetcher.data as { ok?: boolean }).ok === false;
      if (!rejected) continue;
      setOverrides((prev) => {
        if (prev.get(key) !== desired) return prev;
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
      setWriteError(true);
    }
  }, [fetchers]);

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
      setOverrides((prev) => new Map(prev).set(key, desired));

      const existing = pending.current.get(key);
      if (existing) clearTimeout(existing.timer);
      const timer = setTimeout(() => {
        pending.current.delete(key);
        inFlight.current.set(key, desired);
        sendToggle(kind, id, desired);
      }, DEBOUNCE_MS);
      pending.current.set(key, { kind, id, desired, timer });
    },
    [isAuthenticated, sendToggle],
  );

  // Flush queued writes if the provider unmounts (locale teardown) so a debounced
  // heart is persisted rather than silently dropped. The submission lives on the
  // (app-global) router, so it completes even though this subtree is gone.
  useEffect(() => {
    const pendingWrites = pending.current;
    return () => {
      for (const write of pendingWrites.values()) {
        clearTimeout(write.timer);
        sendToggle(write.kind, write.id, write.desired);
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
