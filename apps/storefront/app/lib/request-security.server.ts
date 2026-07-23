import { randomBytes } from 'node:crypto';
import type { RouterContextProvider } from 'react-router';
import { storefrontAuthMiddleware } from './auth-middleware.server';
import { storefrontEnv } from './env.server';
import { storefrontCspNonceContext } from './security-context.server';
import { resolveTenant } from './tenant.server';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const OPERATIONAL_PATHS = new Set(['/healthz', '/readyz']);
const PUBLIC_PAGE_KINDS = new Set(['t', 'l', 'g', 'p']);
const PRIVATE_CACHE_CONTROL = 'private, no-store';
const PUBLIC_PAGE_CACHE_CONTROL = 'public, max-age=0, s-maxage=60, stale-while-revalidate=300';
const PUBLIC_METADATA_CACHE_CONTROL =
  'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';

function requestOrigin(request: Request): string | null {
  const host = request.headers.get('host')?.split(',')[0]?.trim();
  if (!host) return null;
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const protocol =
    forwardedProto === 'http' || forwardedProto === 'https'
      ? forwardedProto
      : new URL(request.url).protocol.replace(':', '');
  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return null;
  }
}

function csrfFailure(request: Request): Response | null {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return null;

  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin') {
    return forbidden();
  }

  const originHeader = request.headers.get('origin');
  const expectedOrigin = requestOrigin(request);
  if (!originHeader || originHeader === 'null' || !expectedOrigin) return forbidden();

  try {
    const origin = new URL(originHeader);
    if (origin.origin !== expectedOrigin) return forbidden();
    if (storefrontEnv.production && origin.protocol !== 'https:') return forbidden();
  } catch {
    return forbidden();
  }
  return null;
}

function forbidden(): Response {
  return Response.json(
    { code: 'CROSS_ORIGIN_MUTATION', message: 'Cross-origin mutation rejected.' },
    { status: 403, headers: { 'Cache-Control': PRIVATE_CACHE_CONTROL } },
  );
}

function createCspNonce(): string {
  return randomBytes(16).toString('base64');
}

function contentSecurityPolicy(nonce: string): string {
  const scriptSources = ["'self'", `'nonce-${nonce}'`];
  const styleSources = ["'self'", 'https://fonts.googleapis.com'];
  const connectSources = ["'self'", ...storefrontEnv.storageUploadOrigins];
  const paymentSources = [...storefrontEnv.paymentRedirectOrigins];
  const mediaSources = ['https:'];

  if (storefrontEnv.production) {
    styleSources.push(`'nonce-${nonce}'`);
  } else {
    scriptSources.push("'unsafe-eval'");
    // Vite injects CSS through nonce-less <style> tags during hydration and HMR.
    styleSources.push("'unsafe-inline'");
    connectSources.push('ws:', 'wss:');
    mediaSources.push('http:');
  }

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    `script-src ${scriptSources.join(' ')}`,
    "script-src-attr 'none'",
    `style-src ${styleSources.join(' ')}`,
    "style-src-attr 'unsafe-inline'",
    "font-src 'self' data: https://fonts.gstatic.com",
    `img-src 'self' data: blob: ${mediaSources.join(' ')}`,
    `media-src 'self' blob: ${mediaSources.join(' ')}`,
    `connect-src ${connectSources.join(' ')}`,
    `form-action 'self' ${paymentSources.join(' ')}`,
    `frame-src 'self' ${paymentSources.join(' ')}`,
    "manifest-src 'self'",
    "worker-src 'self' blob:",
  ];

  if (storefrontEnv.production) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

function appendVary(headers: Headers, value: string): void {
  const current = headers.get('Vary');
  const values = current
    ? current
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    : [];
  if (values.includes(value.toLowerCase())) return;
  headers.set('Vary', current ? `${current}, ${value}` : value);
}

function publicCacheControl(url: URL): string | null {
  if (url.search) return null;
  const { pathname } = url;
  if (pathname === '/sitemap.xml' || pathname === '/robots.txt') {
    return PUBLIC_METADATA_CACHE_CONTROL;
  }

  const segments = pathname.split('/').filter(Boolean);
  const locale = segments[0];
  if (locale !== 'vi' && locale !== 'en') return null;
  if (segments.length === 1) return PUBLIC_PAGE_CACHE_CONTROL;
  if (segments.length === 2 && segments[1] === 'community') return PUBLIC_PAGE_CACHE_CONTROL;
  if (segments.length === 3 && PUBLIC_PAGE_KINDS.has(segments[1]!)) {
    return PUBLIC_PAGE_CACHE_CONTROL;
  }
  return null;
}

function applyCachePolicy(headers: Headers, request: Request, responseStatus: number): void {
  appendVary(headers, 'Cookie');

  const method = request.method.toUpperCase();
  const publicPolicy = publicCacheControl(new URL(request.url));
  const existing = headers.get('Cache-Control')?.toLowerCase() ?? '';
  const mustStayPrivate =
    !['GET', 'HEAD'].includes(method) ||
    responseStatus !== 200 ||
    Boolean(request.headers.get('cookie')) ||
    headers.has('set-cookie') ||
    existing.includes('no-store') ||
    existing.includes('private') ||
    !publicPolicy;

  headers.set('Cache-Control', mustStayPrivate ? PRIVATE_CACHE_CONTROL : publicPolicy);
}

function applySecurityHeaders(
  headers: Headers,
  request: Request,
  responseStatus: number,
  cspNonce: string,
): void {
  headers.set('Content-Security-Policy', contentSecurityPolicy(cspNonce));
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(self)');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  applyCachePolicy(headers, request, responseStatus);

  if (storefrontEnv.production && requestOrigin(request)?.startsWith('https://')) {
    headers.set('Strict-Transport-Security', 'max-age=31536000');
  }
}

function withSecurityHeaders(response: Response, request: Request, cspNonce: string): Response {
  try {
    // Most application responses have mutable headers. Updating them in place
    // preserves separate Set-Cookie values without rebuilding a streaming body.
    applySecurityHeaders(response.headers, request, response.status, cspNonce);
    return response;
  } catch {
    // Redirect responses may expose an immutable header guard. Clone only those.
    const headers = new Headers(response.headers);
    applySecurityHeaders(headers, request, response.status, cspNonce);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

export async function storefrontRequestMiddleware(
  args: { request: Request; context: Readonly<RouterContextProvider> },
  next: () => Promise<Response>,
): Promise<Response> {
  const { request, context } = args;
  const cspNonce = createCspNonce();
  context.set(storefrontCspNonceContext, cspNonce);

  const pathname = new URL(request.url).pathname;
  if (OPERATIONAL_PATHS.has(pathname)) {
    return withSecurityHeaders(await next(), request, cspNonce);
  }

  const rejected = csrfFailure(request);
  if (rejected) return withSecurityHeaders(rejected, request, cspNonce);
  const tenant = await resolveTenant(request);
  const response = await storefrontAuthMiddleware({ request }, next, tenant);
  return withSecurityHeaders(response, request, cspNonce);
}
