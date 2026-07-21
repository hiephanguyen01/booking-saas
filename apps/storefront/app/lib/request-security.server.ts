import { storefrontAuthMiddleware } from './auth-middleware.server';
import { storefrontEnv } from './env.server';
import { resolveTenant } from './tenant.server';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const OPERATIONAL_PATHS = new Set(['/healthz', '/readyz']);
const CONTENT_SECURITY_POLICY = "base-uri 'self'; object-src 'none'; frame-ancestors 'self'";

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

function withSecurityHeaders(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(self)');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'SAMEORIGIN');

  if (storefrontEnv.production && requestOrigin(request)?.startsWith('https://')) {
    headers.set('Strict-Transport-Security', 'max-age=31536000');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function storefrontRequestMiddleware(
  args: { request: Request },
  next: () => Promise<Response>,
): Promise<Response> {
  const { request } = args;
  const pathname = new URL(request.url).pathname;
  if (OPERATIONAL_PATHS.has(pathname)) {
    return withSecurityHeaders(await next(), request);
  }

  const rejected = csrfFailure(request);
  if (rejected) return withSecurityHeaders(rejected, request);
  const tenant = await resolveTenant(request);
  return withSecurityHeaders(await storefrontAuthMiddleware({ request }, next, tenant), request);
}
