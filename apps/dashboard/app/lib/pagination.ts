// Querystring helpers for server-paginated lists. Client-safe, framework-free.

/** 1-based page number from a `?page=` param; absent/invalid → 1. */
export function parsePage(searchParams: URLSearchParams): number {
  return Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
}

/**
 * Href for `page`, preserving the given filter params (pass a querystring or
 * URLSearchParams WITHOUT the page key — e.g. the serialized active filters).
 */
export function pageHref(filters: string | URLSearchParams, page: number): string {
  const q = new URLSearchParams(filters);
  q.set('page', String(page));
  return `?${q}`;
}
