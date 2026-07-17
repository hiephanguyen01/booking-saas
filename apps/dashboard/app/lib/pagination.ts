// Querystring helpers for server-paginated lists. Client-safe, framework-free.

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@booking/contracts';

export type FilterPatch = Record<string, string | number | boolean | undefined | null>;

/** 1-based page number from a param (default `page`); absent/invalid → 1. */
export function parsePage(searchParams: URLSearchParams, key = 'page'): number {
  return Math.max(1, Math.trunc(Number(searchParams.get(key) ?? '1')) || 1);
}

function parsePageSize(searchParams: URLSearchParams, key: string, fallback: number): number {
  const raw = Math.trunc(Number(searchParams.get(key) ?? fallback)) || fallback;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, raw));
}

/** Clone `searchParams`, apply a patch (`undefined`/`null`/`''` deletes the key). */
export function patchSearchParams(
  searchParams: URLSearchParams,
  patch: FilterPatch,
): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null || value === '') next.delete(key);
    else next.set(key, String(value));
  }
  return next;
}

export interface ListParams {
  page: number;
  pageSize: number;
  /** api-client `{ query }` object: page/pageSize + non-empty filters. */
  toApiQuery: (filters?: FilterPatch) => Record<string, string | number | boolean>;
  /** Page/pageSize nav href (preserves every other param) — feed to `<PaginationBar hrefFor>`. */
  pageHref: (target: { page: number; pageSize: number }) => string;
  /** Filter-change href: apply a patch and reset THIS list to page 1 (keeps pageSize + other params). */
  filterHref: (patch: FilterPatch) => string;
}

export interface ReadListParamsOptions {
  defaultPageSize?: number;
  /** URL key for the page number (default `page`) — namespace embedded tables (`subPage`, …). */
  pageKey?: string;
  /** URL key for the page size (default `pageSize`). */
  pageSizeKey?: string;
}

/**
 * Read pagination params off a loader URL and hand back the derived query + href
 * builders. One reader for every server-paginated list — kills the per-route
 * `parsePage` + querystring assembly + `Math.ceil` duplication. Pass `pageKey`/
 * `pageSizeKey` when a page hosts more than one paginated table.
 */
export function readListParams(
  searchParams: URLSearchParams,
  opts: ReadListParamsOptions = {},
): ListParams {
  const pageKey = opts.pageKey ?? 'page';
  const pageSizeKey = opts.pageSizeKey ?? 'pageSize';
  const page = parsePage(searchParams, pageKey);
  const pageSize = parsePageSize(
    searchParams,
    pageSizeKey,
    opts.defaultPageSize ?? DEFAULT_PAGE_SIZE,
  );

  return {
    page,
    pageSize,
    toApiQuery: (filters = {}) => {
      const query: Record<string, string | number | boolean> = { page, pageSize };
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null && value !== '') query[key] = value;
      }
      return query;
    },
    pageHref: ({ page: p, pageSize: ps }) =>
      `?${patchSearchParams(searchParams, { [pageKey]: p, [pageSizeKey]: ps })}`,
    filterHref: (patch) =>
      `?${patchSearchParams(searchParams, { ...patch, [pageKey]: undefined })}`,
  };
}
