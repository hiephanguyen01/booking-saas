export function uploadRouteJson(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}

/**
 * Ceiling on a presign request body. Both presign proxies bound the JSON they
 * parse (storefront security gate); the limit is one number so they cannot
 * drift apart.
 */
export const MAX_PRESIGN_REQUEST_BYTES = 16 * 1024;
