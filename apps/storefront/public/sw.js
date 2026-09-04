/*
 * BookingOS storefront service worker.
 *
 * Deliberately conservative, and the reason is the storefront's own posture: every
 * HTML response here is `Cache-Control: private, no-store` and embeds a
 * per-request CSP nonce (see `features/root/server/request-security.server.ts`).
 * Caching documents would put a signed-in visitor's name, email and bookings in
 * Cache Storage on the device. So this worker caches exactly two things — the
 * hashed build output under `/assets/`, and public launcher icons — and never a
 * document. The offline document is generated as a response instead of entering
 * Cache Storage.
 *
 * It lives in `public/` rather than `app/` for two reasons: the registration scope
 * has to be the origin root, and the storefront-security guard in `pnpm test`
 * bans `fetch(` under `apps/storefront/app` (a worker with no fetch handler is not
 * installable).
 *
 * Plain JS on purpose — no build step, no bundler, no imports. The registration
 * URL carries the release identity (`/sw.js?v=<build-id>`), which gives every
 * deployment a distinct cache without hand-editing this file.
 */

const CACHE_PREFIX = 'bookingos-storefront-';
const BUILD_ID = new URL(self.location.href).searchParams.get('v') || 'local';
const SAFE_BUILD_ID = BUILD_ID.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 96) || 'local';
const CACHE_NAME = `${CACHE_PREFIX}${SAFE_BUILD_ID}`;
const IMAGE_CACHE_NAME = `${CACHE_PREFIX}images-v1`;
const MAX_IMAGE_ENTRIES = 80;

/** Public launcher assets used by the fallback and install surfaces. */
const PRECACHE_URLS = [
  '/pwa/icon-180.png',
  '/pwa/icon-192.png',
  '/pwa/icon-512.png',
  '/pwa/icon-maskable-512.png',
];

/**
 * Immutable, public, same-origin assets. `/assets/` is Vite's hashed build output,
 * so a URL there never changes meaning; `/pwa/` holds the manifest icons.
 */
function isCacheableAsset(url) {
  return url.pathname.startsWith('/assets/') || url.pathname.startsWith('/pwa/');
}

/** Check if the request is an image asset (media, covers, avatars, icons). */
function isImageRequest(request, url) {
  if (request.destination === 'image') return true;
  const pathname = url.pathname.toLowerCase();
  return (
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.jpeg') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.webp') ||
    pathname.endsWith('.avif') ||
    pathname.endsWith('.gif') ||
    pathname.endsWith('.svg') ||
    url.hostname.includes('picsum.photos')
  );
}

self.addEventListener('install', (event) => {
  // A failed precache must not leave a half-installed worker in place; the next
  // load retries from scratch. Updates deliberately remain waiting until the UI
  // sends SKIP_WAITING, so an in-progress booking is never interrupted.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter(
              (name) =>
                name.startsWith(CACHE_PREFIX) &&
                name !== CACHE_NAME &&
                name !== IMAGE_CACHE_NAME,
            )
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Network-first, cache nothing, fall back to the offline page. */
async function handleNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    return offlineResponse();
  }
}

/** Self-contained fallback: no cached HTML, scripts, tenant data or network dependency. */
function offlineResponse() {
  const html = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Không có kết nối · No connection</title>
<style>:root{color-scheme:light dark;font-family:system-ui,sans-serif}*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:1.5rem;background:#f4f5f7;color:#18181b}main{max-width:26rem;padding:2rem;border:1px solid #e4e4e7;border-radius:.875rem;background:#fff;text-align:center}h1{font-size:1.25rem}p{color:#6b7280;line-height:1.6}.en{margin-top:1.25rem;padding-top:1.25rem;border-top:1px solid #e4e4e7}a{display:inline-flex;min-height:44px;align-items:center;margin-top:1.5rem;padding:0 1.75rem;border-radius:.5rem;background:#ffb020;color:#18181b;font-weight:600;text-decoration:none}@media(prefers-color-scheme:dark){body{background:#0b0b0d;color:#fafafa}main{border-color:#27272a;background:#17171a}p{color:#a1a1aa}.en{border-color:#27272a}}</style></head>
<body><main><h1>Bạn đang ngoại tuyến</h1><p>Không thể tải trang vì thiết bị không có kết nối mạng. Hãy kiểm tra Wi-Fi hoặc dữ liệu di động rồi thử lại.</p><div class="en"><h2>You are offline</h2><p>This page needs a network connection. Check your Wi-Fi or mobile data, then try again.</p></div><a href="/">Thử lại · Try again</a></main></body></html>`;
  return new Response(html, {
    status: 503,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}

/** Cache-first. Safe only because these URLs are content-hashed or static. */
async function handleAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  // Only a complete, same-origin 200 is worth keeping. An opaque or partial
  // response cached here would be served back indefinitely.
  if (response.ok && response.type === 'basic') {
    await cache.put(request, response.clone());
  }
  return response;
}

/** Keep image cache bounded so device storage remains light. */
async function trimImageCache() {
  try {
    const cache = await caches.open(IMAGE_CACHE_NAME);
    const keys = await cache.keys();
    if (keys.length > MAX_IMAGE_ENTRIES) {
      const toDelete = keys.slice(0, keys.length - MAX_IMAGE_ENTRIES);
      await Promise.all(toDelete.map((key) => cache.delete(key)));
    }
  } catch {
    // Best-effort cache trim
  }
}

/**
 * Stale-while-revalidate for images. Serves cached copy immediately (0ms)
 * and refreshes in the background from network.
 */
async function handleImage(request) {
  const cache = await caches.open(IMAGE_CACHE_NAME);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
        void cache.put(request, networkResponse.clone()).then(() => trimImageCache());
      }
      return networkResponse;
    })
    .catch(() => null);

  if (cached) {
    return cached;
  }

  const response = await fetchPromise;
  if (response) return response;

  return new Response('', { status: 408, statusText: 'Request Timeout' });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    if (url.origin !== self.location.origin) return;
    event.respondWith(handleNavigation(request));
    return;
  }

  if (isImageRequest(request, url)) {
    event.respondWith(handleImage(request));
    return;
  }

  if (url.origin === self.location.origin && isCacheableAsset(url)) {
    event.respondWith(handleAsset(request));
  }
  // Everything else falls through to the browser untouched.
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
