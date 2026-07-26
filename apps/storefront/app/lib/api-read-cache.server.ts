import { createHash } from 'node:crypto';
import type { ApiRequestOptions, Auth } from '@booking/api-client';

const requestReads = new WeakMap<Request, Map<string, Promise<unknown>>>();

export function memoizedRead<T>(
  request: Request,
  key: string,
  read: () => Promise<T>,
): Promise<T> {
  let reads = requestReads.get(request);
  if (!reads) {
    reads = new Map();
    requestReads.set(request, reads);
  }
  const existing = reads.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const pending = read();
  reads.set(key, pending);
  pending.catch(() => reads?.delete(key));
  return pending;
}

export function queryKey(query: ApiRequestOptions<unknown>['query']): string {
  if (!query) return '';
  return JSON.stringify(
    Object.entries(query)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, value]),
  );
}

export function authReadKey(auth: Auth | null): string {
  if (!auth) return 'anonymous';

  const identity =
    typeof auth === 'string'
      ? ['token', auth]
      : [
          'context',
          auth.token,
          auth.tenantId ?? '',
          auth.partnerId ?? '',
          auth.affiliateTenantId ?? '',
        ];

  // Never retain the opaque access token itself in the memoization key. The
  // digest still changes after token rotation, so a refreshed session cannot
  // reuse the cached 401 response produced by the expired token.
  return createHash('sha256').update(JSON.stringify(identity)).digest('base64url');
}
