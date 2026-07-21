import { randomUUID } from 'node:crypto';
import { storefrontAuthMiddleware } from './auth-middleware.server';
import { storefrontEnv } from './env.server';
import { storefrontLogWarn } from './logger.server';
import { resolveTenant } from './tenant.server';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const OPERATIONAL_PATHS = new Set(['/healthz', '/readyz']);
const FALLBACK_CONTENT_SECURITY_POLICY = "base-uri 'self'; object-src 'none'; frame-ancestors 'self'";
const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{1,100}$/;

function resolveRequestId(request: Request): string {
  const candidate = request.headers.get('x-request-id')?.trim();
  return candidate && REQUEST_ID_RE.test(candidate) ? candidate : randomUUID();
}

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
    { status: 403, headers: { 'Cache-Control': 'no-store' } },
  );
}

function applySecurityHeaders(headers: Headers, request: Request, requestId: string): void {
  // HTML responses receive the nonce-based policy in entry.server.tsx. Keep a
  // defensive minimal policy for JSON/operational responses and early failures.
  if (!headers.has('Content-Security-Policy')) {
    headers.set('Content-Security-Policy', FALLBACK_CONTENT_SECURITY_POLICY);
  }
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(self)');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('X-Request-Id', requestId);

  if (storefrontEnv.production && requestOrigin(request)?.startsWith('https://')) {
    headers.set('Strict-Transport-Security', 'max-age=31536000');
  }
}

function withSecurityHeaders(response: Response, request: Request, requestId: string): Response {
  try {
    // Most application responses have mutable headers. Updating them in place
    // preserves separate Set-Cookie values without rebuilding a streaming body.
    applySecurityHeaders(response.headers, request, requestId);
    return response;
  } catch {
    // Redirect responses may expose an immutable header guard. Clone only those.
    const headers = new Headers(response.headers);
    applySecurityHeaders(headers, request, requestId);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

export async function storefrontRequestMiddleware(
  args: { request: Request },
  next: () => Promise<Response>,
): Promise<Response> {
  const { request } = args;
  const pathname = new URL(request.url).pathname;
  const requestId = resolveRequestId(request);
  if (OPERATIONAL_PATHS.has(pathname)) {
    return withSecurityHeaders(await next(), request, requestId);
  }

  const rejected = csrfFailure(request);
  if (rejected) {
    storefrontLogWarn('security.cross_origin_mutation_rejected', {
      requestId,
      requestMethod: request.method.toUpperCase(),
      requestPath: pathname,
    });
    return withSecurityHeaders(rejected, request, requestId);
  }
  const tenant = await resolveTenant(request);
  return withSecurityHeaders(
    await storefrontAuthMiddleware({ request }, next, tenant, requestId),
    request,
    requestId,
  );
}
