import { useEffect } from 'react';

const SERVICE_WORKER_URL = '/sw.js';
const CACHE_PREFIX = 'bookingos-storefront-';

/**
 * Registers `public/sw.js` — a normal module in an effect, so no inline script and
 * no CSP nonce is involved.
 *
 * Registration happens in built output only, and the dev server actively
 * *unregisters*: a worker that survives a `pnpm build` test on `localhost` would
 * otherwise keep serving that build to every later `pnpm dev` session on the same
 * origin, and finding that by hand is miserable.
 *
 * ## Why `import.meta.hot` and not `import.meta.env.PROD`
 *
 * `PROD` is derived from `NODE_ENV`, and the root `.env` that every app and CLI in
 * this repo reads pins `NODE_ENV=development`. The build script loads that file
 * (`--env-file-if-exists=../../.env`), so `import.meta.env.PROD` is **false even
 * during `pnpm build`** — gating on it silently dead-code-eliminated the
 * registration out of the production bundle, leaving a storefront that could never
 * install. `import.meta.hot` is injected by the dev *command* rather than by
 * `NODE_ENV`, and Vite statically replaces it with `undefined` when building, so it
 * distinguishes the two cases the way this needs.
 *
 * To exercise the real thing locally:
 *   pnpm --filter=@booking/storefront build && pnpm --filter=@booking/storefront start
 * `localhost` and its subdomains are secure contexts, so no TLS setup is needed.
 */
export function useServiceWorker(): void {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (import.meta.hot) {
      void unregisterAll();
      return;
    }

    // Registration rejects in private-mode Firefox and some embedded webviews. A
    // storefront that cannot install offline support still has to render.
    void navigator.serviceWorker.register(SERVICE_WORKER_URL).catch(() => {});
  }, []);
}

async function unregisterAll(): Promise<void> {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    if (registrations.length > 0 && 'caches' in window) {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith(CACHE_PREFIX)).map((name) => caches.delete(name)),
      );
    }
  } catch {
    // Nothing actionable — the page renders either way.
  }
}
