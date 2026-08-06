/*
 * BookingOS storefront service worker.
 *
 * Deliberately conservative, and the reason is the storefront's own posture: every
 * HTML response here is `Cache-Control: private, no-store` and embeds a
 * per-request CSP nonce (see `features/root/server/request-security.server.ts`).
 * Caching documents would put a signed-in visitor's name, email and bookings in
 * Cache Storage on the device. So this worker caches exactly two things — the
 * hashed build output under `/assets/`, and its own precache — and never a
 * document.
 *
 * It lives in `public/` rather than `app/` for two reasons: the registration scope
 * has to be the origin root, and `scripts/architecture/check-storefront-security.mjs`
 * bans `fetch(` under `apps/storefront/app` (a worker with no fetch handler is not
 * installable).
 *
 * Plain JS on purpose — no build step, no bundler, no imports. Bump CACHE_VERSION
 * to evict everything on the next activation.
 */

const CACHE_VERSION = 'v1';
const CACHE_NAME = `bookingos-storefront-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

/** Everything the offline fallback needs in order to render with no network. */
const PRECACHE_URLS = [OFFLINE_URL, '/pwa/icon-192.png'];

/**
 * Immutable, public, same-origin assets. `/assets/` is Vite's hashed build output,
 * so a URL there never changes meaning; `/pwa/` holds the manifest icons.
 * Anything else — `.data` requests, presign proxies, `/set-locale`, `/healthz`,
 * `/manifest.webmanifest`, the S3/MinIO image origins — is left to the browser.
 */
function isCacheableAsset(url) {
  return url.pathname.startsWith('/assets/') || url.pathname.startsWith('/pwa/');
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      // A failed precache must not leave a half-installed worker in place; the
      // next load retries from scratch.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))),
      )
      .then(() => self.clients.claim()),
  );
});

/** Network-first, cache nothing, fall back to the offline page. */
async function handleNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    const cached = await caches.match(OFFLINE_URL);
    return (
      cached ??
      new Response('Offline', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    );
  }
}

/** Cache-first. Safe only because these URLs are content-hashed or static. */
async function handleAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  // Only a complete, same-origin 200 is worth keeping. An opaque or partial
  // response cached here would be served back indefinitely.
  if (response.ok && response.type === 'basic') {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (isCacheableAsset(url)) {
    event.respondWith(handleAsset(request));
  }
  // Everything else falls through to the browser untouched.
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
