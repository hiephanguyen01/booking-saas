import { useMemo, useState } from 'react';

/**
 * Client-side status filtering with per-status counts, for StatusFilterTabs.
 * Pass a module-level `getStatus` (e.g. `(p) => p.status`) so the memos hold.
 * Filter state is per-mount (lost on navigation) — matching the existing UX.
 */
export function useStatusFilter<T>(items: T[], getStatus: (item: T) => string) {
  const [filter, setFilter] = useState('all');

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const item of items) {
      const status = getStatus(item);
      c[status] = (c[status] ?? 0) + 1;
    }
    return c;
  }, [items, getStatus]);

  const rows = useMemo(
    () => (filter === 'all' ? items : items.filter((item) => getStatus(item) === filter)),
    [filter, items, getStatus],
  );

  return { filter, setFilter, rows, counts };
}
