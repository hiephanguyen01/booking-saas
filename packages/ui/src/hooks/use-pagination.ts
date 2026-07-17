import * as React from 'react';

export type PaginationToken = number | 'ellipsis';

export interface UsePaginationParams {
  page: number;
  pageSize: number;
  total: number;
  /** Page numbers to keep either side of the current page (default 1). */
  siblingCount?: number;
}

export interface UsePaginationResult {
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
  /** From-row (1-based) of the current page, clamped to `[0, total]`. */
  from: number;
  /** To-row (1-based) of the current page. */
  to: number;
  /** Page numbers to render, with `"ellipsis"` gap tokens. */
  range: PaginationToken[];
}

function buildRange(current: number, totalPages: number, siblingCount: number): PaginationToken[] {
  // first + last + current + 2*siblings + 2 ellipsis slots
  const slots = siblingCount * 2 + 5;
  if (totalPages <= slots) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const left = Math.max(current - siblingCount, 1);
  const right = Math.min(current + siblingCount, totalPages);
  const showLeftEllipsis = left > 2;
  const showRightEllipsis = right < totalPages - 1;

  const tokens: PaginationToken[] = [1];
  if (showLeftEllipsis) tokens.push('ellipsis');
  else for (let p = 2; p < left; p++) tokens.push(p);

  for (let p = left; p <= right; p++) {
    if (p !== 1 && p !== totalPages) tokens.push(p);
  }

  if (showRightEllipsis) tokens.push('ellipsis');
  else for (let p = right + 1; p < totalPages; p++) tokens.push(p);

  tokens.push(totalPages);
  return tokens;
}

/**
 * Pure pagination math for the shared `<Pagination>` control — no routing, no
 * state, safe in both apps. Kills the per-route `Math.ceil(total/pageSize)`
 * duplication and the ad-hoc page-range building.
 */
export function usePagination({
  page,
  pageSize,
  total,
  siblingCount = 1,
}: UsePaginationParams): UsePaginationResult {
  return React.useMemo(() => {
    const safeSize = Math.max(1, pageSize);
    const totalPages = Math.max(1, Math.ceil(total / safeSize));
    const current = Math.min(Math.max(1, page), totalPages);
    const from = total === 0 ? 0 : (current - 1) * safeSize + 1;
    const to = Math.min(current * safeSize, total);
    return {
      totalPages,
      hasPrev: current > 1,
      hasNext: current < totalPages,
      from,
      to,
      range: buildRange(current, totalPages, siblingCount),
    };
  }, [page, pageSize, total, siblingCount]);
}
