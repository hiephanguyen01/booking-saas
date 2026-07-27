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

/**
 * A repository's un-mapped page: the rows for the requested window plus the
 * total matching the same WHERE clause. Deliberately NOT `Paginated<T>` — that
 * is the wire envelope (it carries `page`/`pageSize` and holds mapped DTOs);
 * this is the pre-mapping repository/port result that `toPaginated()` consumes.
 * Rows may still hold `bigint` money, so never send a `RepoPage` over the wire.
 */
export type RepoPage<T> = { items: T[]; total: number };

/**
 * The `{ [status]: count, all }` chip map produced by {@link toStatusCounts}.
 * Keys are status strings, so it stays an open record rather than a per-module
 * enum map — each module's statuses differ.
 */
export type StatusCounts = Record<string, number>;

/**
 * A `RepoPage` for a list that also renders `<StatusFilterTabs>`. The counts are
 * computed over the WHERE clause WITHOUT the active status filter, so they do
 * not describe `items` — see {@link toStatusCounts}.
 */
export type RepoPageWithCounts<T> = RepoPage<T> & { counts: StatusCounts };

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
  result: RepoPage<TItem>,
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
): StatusCounts {
  const counts: StatusCounts = {};
  let all = 0;
  for (const row of rows) {
    counts[row.status] = row._count;
    all += row._count;
  }
  counts.all = all;
  return counts;
}
