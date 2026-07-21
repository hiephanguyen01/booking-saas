import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { storefrontAuthMiddleware } from './auth-middleware.server';
import { storefrontEnv } from './env.server';
import {
  storefrontLogError,
  storefrontLogHttpResponse,
  storefrontLogWarn,
} from './logger.server';
import { resolveTenant } from './tenant.server';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const OPERATIONAL_PATHS = new Set(['/healthz', '/readyz']);
const FALLBACK_CONTENT_SECURITY_POLICY = "base-uri 'self'; object-src 'none'; frame-ancestors 'self'";
const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{1,100}$/;

interface RequestLifecycle {
  request: Request;
  requestId: string;
  requestPath: string;
  startedAtMs: number;
  tenantId?: string;
}

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

function durationMilliseconds(startedAtMs: number): number {
  return Number(Math.max(0, performance.now() - startedAtMs).toFixed(1));
}

function responseOutcome(statusCode: number): string {
  if (statusCode >= 500) return 'server_error';
  if (statusCode >= 400) return 'client_error';
  if (statusCode >= 300) return 'redirect';
  return 'success';
}

function responseKind(response: Response): string {
  if (response.status >= 300 && response.status < 400) return 'redirect';
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (contentType === 'text/html') return 'html';
  if (contentType === 'application/json') return 'json';
  if (contentType === 'text/css') return 'css';
  if (contentType?.startsWith('image/')) return 'image';
  return contentType || 'unknown';
}

function lifecycleDetails(
  lifecycle: RequestLifecycle,
  response: Response,
  responseBytes: number,
): Record<string, unknown> {
  return {
    requestId: lifecycle.requestId,
    requestMethod: lifecycle.request.method.toUpperCase(),
    requestPath: lifecycle.requestPath,
    ...(lifecycle.tenantId ? { tenantId: lifecycle.tenantId } : {}),
    durationMs: durationMilliseconds(lifecycle.startedAtMs),
    outcome: responseOutcome(response.status),
    responseKind: responseKind(response),
    responseBytes,
  };
}

function shouldLogLifecycle(requestPath: string, statusCode: number): boolean {
  return !OPERATIONAL_PATHS.has(requestPath) || statusCode >= 400;
}

function withRequestLifecycleLogging(response: Response, lifecycle: RequestLifecycle): Response {
  if (!shouldLogLifecycle(lifecycle.requestPath, response.status)) return response;

  if (!response.body || lifecycle.request.method.toUpperCase() === 'HEAD') {
    storefrontLogHttpResponse(
      'http.request_completed',
      response.status,
      lifecycleDetails(lifecycle, response, 0),
    );
    return response;
  }

  const reader = response.body.getReader();
  let responseBytes = 0;
  let finished = false;

  const complete = (): void => {
    if (finished) return;
    finished = true;
    storefrontLogHttpResponse(
      'http.request_completed',
      response.status,
      lifecycleDetails(lifecycle, response, responseBytes),
    );
  };

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          complete();
          controller.close();
          return;
        }
        responseBytes += chunk.value.byteLength;
        controller.enqueue(chunk.value);
      } catch (error) {
        if (!finished) {
          finished = true;
          storefrontLogError('http.response_stream_failed', error, {
            ...lifecycleDetails(lifecycle, response, responseBytes),
            outcome: 'stream_error',
            statusCode: response.status,
          });
        }
        controller.error(error);
      }
    },
    async cancel(reason) {
      if (!finished) {
        finished = true;
        storefrontLogWarn('http.request_aborted', {
          ...lifecycleDetails(lifecycle, response, responseBytes),
          outcome: 'client_cancelled',
          statusCode: response.status,
        });
      }
      await reader.cancel(reason);
    },
  });

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function logRequestFailure(error: unknown, lifecycle: RequestLifecycle): void {
  const statusCode = error instanceof Response ? error.status : 500;
  const details = {
    requestId: lifecycle.requestId,
    requestMethod: lifecycle.request.method.toUpperCase(),
    requestPath: lifecycle.requestPath,
    ...(lifecycle.tenantId ? { tenantId: lifecycle.tenantId } : {}),
    durationMs: durationMilliseconds(lifecycle.startedAtMs),
    outcome: lifecycle.request.signal.aborted ? 'client_aborted' : 'failed_before_response',
  };

  if (error instanceof Response) {
    storefrontLogHttpResponse('http.request_failed', statusCode, details);
  } else {
    storefrontLogError('http.request_failed', error, { ...details, statusCode });
  }
}

export async function storefrontRequestMiddleware(
  args: { request: Request },
  next: () => Promise<Response>,
): Promise<Response> {
  const { request } = args;
  const requestPath = new URL(request.url).pathname;
  const requestId = resolveRequestId(request);
  const lifecycle: RequestLifecycle = {
    request,
    requestId,
    requestPath,
    startedAtMs: performance.now(),
  };

  try {
    let response: Response;
    if (OPERATIONAL_PATHS.has(requestPath)) {
      response = await next();
    } else {
      const rejected = csrfFailure(request);
      if (rejected) {
        storefrontLogWarn('security.cross_origin_mutation_rejected', {
          requestId,
          requestMethod: request.method.toUpperCase(),
          requestPath,
        });
        response = rejected;
      } else {
        const tenant = await resolveTenant(request);
        lifecycle.tenantId = tenant.id;
        response = await storefrontAuthMiddleware(
          { request },
          next,
          tenant,
          requestId,
          lifecycle.startedAtMs,
        );
      }
    }

    return withRequestLifecycleLogging(
      withSecurityHeaders(response, request, requestId),
      lifecycle,
    );
  } catch (error) {
    logRequestFailure(error, lifecycle);
    throw error;
  }
}
