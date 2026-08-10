import { useCallback, useEffect, useRef, useState } from 'react';

const SERVICE_WORKER_URL = `/sw.js?v=${encodeURIComponent(__STOREFRONT_BUILD_ID__)}`;
const CACHE_PREFIX = 'bookingos-storefront-';

/** Register the release worker and expose its waiting lifecycle to the PWA UI. */
export function useServiceWorker() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const reloadRequested = useRef(false);

  useEffect(() => {
    if (import.meta.hot) {
      void unregisterAll();
      return;
    }
    if (!('serviceWorker' in navigator)) return;

    let disposed = false;
    const cleanups: Array<() => void> = [];

    const onControllerChange = () => {
      if (!reloadRequested.current) return;
      reloadRequested.current = false;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    cleanups.push(() =>
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange),
    );

    void navigator.serviceWorker
      .register(SERVICE_WORKER_URL)
      .then((registration) => {
        if (disposed) return;
        if (registration.waiting) setWaitingWorker(registration.waiting);

        const onUpdateFound = () => {
          const installing = registration.installing;
          if (!installing) return;
          const onStateChange = () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              setWaitingWorker(registration.waiting ?? installing);
            }
          };
          installing.addEventListener('statechange', onStateChange);
          cleanups.push(() => installing.removeEventListener('statechange', onStateChange));
        };
        registration.addEventListener('updatefound', onUpdateFound);
        cleanups.push(() => registration.removeEventListener('updatefound', onUpdateFound));
      })
      .catch(() => {
        // Private-mode Firefox and embedded webviews can reject registration.
        // The storefront remains fully usable online without a worker.
      });

    return () => {
      disposed = true;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  const applyUpdate = useCallback(() => {
    if (!waitingWorker) return;
    reloadRequested.current = true;
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  }, [waitingWorker]);

  return { applyUpdate, updateAvailable: waitingWorker !== null };
}

async function unregisterAll(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch {
    // Continue with cache cleanup even when worker access is unavailable.
  }

  try {
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith(CACHE_PREFIX)).map((name) => caches.delete(name)),
      );
    }
  } catch {
    // Development cleanup is best-effort and must never block rendering.
  }
}
