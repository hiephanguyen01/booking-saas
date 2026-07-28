import type { ApiRequestOptions } from '@booking/api-client';
import type { ZodType, ZodTypeDef } from 'zod';

const INVALID_HOST_DELIMITER_RE = /[\\/?#@]/;
const MAX_FORWARDED_HOST_LENGTH = 255;

export type StorefrontJsonOptions<T> = Omit<ApiRequestOptions<T>, 'signal' | 'schema'> & {
  schema: ZodType<T, ZodTypeDef, unknown>;
};

export type NullableReadOptions<T> = StorefrontJsonOptions<T> & { allowNotFound: true };

function invalidForwardedHost(): never {
  throw new Response('Invalid storefront host', { status: 400 });
}

function hasInvalidHostCharacters(value: string): boolean {
  if (INVALID_HOST_DELIMITER_RE.test(value)) return true;
  for (const character of value) {
    const codePoint = character.charCodeAt(0);
    if (codePoint <= 0x20 || codePoint === 0x7f) return true;
  }
  return false;
}

export function forwardedHost(request: Request): string {
  // Keep the port: checkout callbacks must return to the exact storefront host
  // the customer used (for example localhost:5173). The API still owns the
  // Host→tenant authorization decision; the BFF only rejects ambiguous or
  // malformed values before forwarding them.
  const raw = request.headers.get('host')?.split(',')[0]?.trim() || new URL(request.url).host;
  if (!raw || raw.length > MAX_FORWARDED_HOST_LENGTH || hasInvalidHostCharacters(raw)) {
    invalidForwardedHost();
  }

  let parsed: URL;
  try {
    parsed = new URL(`http://${raw}`);
  } catch {
    invalidForwardedHost();
  }

  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash ||
    !parsed.hostname
  ) {
    invalidForwardedHost();
  }

  const normalized = parsed.host.toLowerCase();
  if (!normalized || normalized.length > MAX_FORWARDED_HOST_LENGTH) invalidForwardedHost();
  return normalized;
}

export function storefrontRequestOptions<T>(
  request: Request,
  options: StorefrontJsonOptions<T>,
): ApiRequestOptions<T> {
  return {
    ...options,
    signal: request.signal,
    requestId: options.requestId ?? request.headers.get('x-request-id') ?? undefined,
    headers: {
      ...options.headers,
      'x-forwarded-host': forwardedHost(request),
    },
  };
}

export function storefrontAuthOptions(request: Request) {
  return {
    signal: request.signal,
    requestId: request.headers.get('x-request-id') ?? undefined,
    headers: { 'x-forwarded-host': forwardedHost(request) },
  };
}
