/**
 * Offset-pagination helpers — pure functions, no DI, no Nest module (mirrors
 * `shared/money` & `shared/time`; hexagonal hard-rule #2: no service classes).
 *
 * These run OUTSIDE the tenant transaction: a repository produces `{ items, total }`
 * inside its own `forTenant` tx (RLS applied), the use-case/controller then wraps
 * that result here. They touch no tenant data and no `bigint` money (money→string
 * mapping stays in each module's mapper), so RLS and money-safety are untouched.
 */
import type { Paginated } from '@booking/contracts';

/** `{ page, pageSize }` → Prisma `{ skip, take }`. Page is 1-based. */
export function pageOffset(query: { page: number; pageSize: number }): {
  skip: number;
  take: number;
} {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

/**
 * Assemble the `Paginated<TOut>` envelope from a repository's `{ items, total }`
 * and a row mapper — collapses the `{ items: rows.map(map), page, pageSize, total }`
 * that every list controller would otherwise repeat.
 */
export function toPaginated<TItem, TOut>(
  query: { page: number; pageSize: number },
  result: { items: TItem[]; total: number },
  map: (item: TItem) => TOut,
): Paginated<TOut> {
  return {
    items: result.items.map(map),
    page: query.page,
    pageSize: query.pageSize,
    total: result.total,
  };
}

/**
 * Collapse Prisma `groupBy({ by: ['status'], _count: true })` rows into a
 * `{ [status]: count, all: <sum> }` map for a `<StatusFilterTabs>` chip row.
 * Compute it over the WHERE clause WITHOUT the active status filter so every tab
 * shows its own total.
 */
export function toStatusCounts(
  rows: ReadonlyArray<{ status: string; _count: number }>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  let all = 0;
  for (const row of rows) {
    counts[row.status] = row._count;
    all += row._count;
  }
  counts.all = all;
  return counts;
}
