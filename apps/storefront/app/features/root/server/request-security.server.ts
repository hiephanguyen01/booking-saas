import { randomBytes } from 'node:crypto';
import type { RouterContextProvider } from 'react-router';
import { pathLocale, storefrontPaths } from '~/constants/paths';
import { storefrontAuthMiddleware } from '~/lib/server/auth-middleware.server';
import { storefrontEnv } from '~/lib/server/env.server';
import { runWithStorefrontRequestContext } from '~/lib/server/request-context.server';
import { storefrontCspNonceContext } from '~/lib/server/security-context.server';
import { resolveStorefront } from '~/lib/server/tenant.server';
import { tenantUnavailableResponse } from '~/lib/tenant-availability';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const DOCUMENT_METHODS = new Set(['GET', 'HEAD']);
const OPERATIONAL_PATHS = new Set(['/healthz', '/readyz']);
const PLATFORM_DOCUMENT_PATHS = new Set(['/vi', '/en', '/robots.txt', '/sitemap.xml']);
const PRIVATE_CACHE_CONTROL = 'private, no-store';
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

function unknownHost(): Response {
  return Response.json(
    { code: 'UNKNOWN_HOST', message: 'No tenant is mapped to this host.' },
    { status: 404, headers: { 'Cache-Control': PRIVATE_CACHE_CONTROL } },
  );
}

function platformRedirect(locale: 'vi' | 'en'): Response {
  return new Response(null, { status: 302, headers: { Location: storefrontPaths.home(locale) } });
}

function createCspNonce(): string {
  return randomBytes(16).toString('base64');
}

const CSP_NONCE_PLACEHOLDER = '__csp-nonce__';
const CSP_NONCE_PLACEHOLDER_RE = new RegExp(CSP_NONCE_PLACEHOLDER, 'g');

function buildCspTemplate(): string {
  const nonce = CSP_NONCE_PLACEHOLDER;
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

/**
 * Only the nonce varies per request; every other input is frozen at startup
 * (`storefrontEnv`), so the directive list is assembled once and the nonce
 * spliced into the finished string.
 */
const CSP_TEMPLATE = buildCspTemplate();

function contentSecurityPolicy(nonce: string): string {
  // The template already carries `'nonce-<placeholder>'`, so only the value is spliced.
  // A base64 nonce cannot contain `$`, so no replacement-pattern escaping is needed.
  return CSP_TEMPLATE.replace(CSP_NONCE_PLACEHOLDER_RE, nonce);
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

function sharedCacheControl(url: URL): string | null {
  if (url.search) return null;

  // HTML responses embed a request-specific CSP nonce in both the document and
  // response header, so they must never enter a shared cache. These metadata
  // endpoints do not render nonce-bearing HTML and are safe to cache publicly.
  if (url.pathname === '/sitemap.xml' || url.pathname === '/robots.txt') {
    return PUBLIC_METADATA_CACHE_CONTROL;
  }

  return null;
}

function applyCachePolicy(headers: Headers, request: Request, responseStatus: number): void {
  appendVary(headers, 'Cookie');

  const method = request.method.toUpperCase();
  const sharedPolicy = sharedCacheControl(new URL(request.url));
  const existing = headers.get('Cache-Control')?.toLowerCase() ?? '';
  const mustStayPrivate =
    !['GET', 'HEAD'].includes(method) ||
    responseStatus !== 200 ||
    Boolean(request.headers.get('cookie')) ||
    headers.has('set-cookie') ||
    existing.includes('no-store') ||
    existing.includes('private') ||
    !sharedPolicy;

  headers.set('Cache-Control', mustStayPrivate ? PRIVATE_CACHE_CONTROL : sharedPolicy);
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
  // Every exit from this middleware carries the same headers; naming that once
  // keeps the response-header contract legible across every branch below.
  const secure = (response: Response) => withSecurityHeaders(response, request, cspNonce);

  const pathname = new URL(request.url).pathname;
  if (OPERATIONAL_PATHS.has(pathname)) {
    return secure(await next());
  }

  const rejected = csrfFailure(request);
  if (rejected) return secure(rejected);

  const method = request.method.toUpperCase();
  const isDocumentRequest = DOCUMENT_METHODS.has(method);
  const resolution = await resolveStorefront(request);
  if (resolution.kind === 'unknown-host') {
    const response = secure(unknownHost());
    if (isDocumentRequest) throw response;
    return response;
  }

  if (resolution.kind === 'platform') {
    if (!isDocumentRequest) return secure(unknownHost());

    const url = new URL(request.url);
    const locale = pathLocale(url.pathname);
    const isLocalizedLanding = url.pathname === '/vi' || url.pathname === '/en';
    if (!PLATFORM_DOCUMENT_PATHS.has(url.pathname) || (isLocalizedLanding && Boolean(url.search))) {
      return secure(platformRedirect(locale));
    }

    const response = await runWithStorefrontRequestContext(
      { kind: 'platform', auth: null, suppressSessionCommit: false },
      next,
    );
    return secure(response);
  }

  const tenant = resolution.tenant;
  const unavailable = tenantUnavailableResponse(request, tenant);
  if (unavailable) {
    throw secure(unavailable);
  }
  const response = await storefrontAuthMiddleware({ request }, next, tenant);
  return secure(response);
}
