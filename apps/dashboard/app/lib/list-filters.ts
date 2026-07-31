// Generic URL <-> list-filter reader. Client-safe, framework-free. Pairs with
// readListParams (pagination.ts): readListFilters parses the *filter* params,
// readListParams parses page/pageSize. Feed apiFilters straight into toApiQuery.
import { TZ_OFFSET } from '~/constants/time';

export type FilterField =
  | { kind: 'text'; key: string; label: string; placeholder: string }
  | {
      kind: 'enum';
      key: string;
      label: string;
      options: readonly { value: string; label: string }[];
      /** Label for the "no filter" option (default "Tất cả"). */
      allLabel?: string;
      /** Extra classes on the select — e.g. `sm:min-w-0` to drop the compact min width. */
      className?: string;
    }
  | { kind: 'date-range'; fromKey: string; toKey: string; label: string };

export type FilterSpec = readonly FilterField[];

/** Convert a `YYYY-MM-DD` day to an ISO instant at the start/end of that day (project TZ). */
export function boundIso(day: string, edge: 'start' | 'end'): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  const time = edge === 'start' ? '00:00:00.000' : '23:59:59.999';
  const value = new Date(`${day}T${time}${TZ_OFFSET}`);
  return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
}

export interface ReadListFiltersResult {
  /** Raw values keyed by URL key — bind to controlled inputs' `defaultValue`. */
  filters: Record<string, string>;
  /** Cleaned values (empty dropped, dates -> ISO bounds) — pass to `toApiQuery`. */
  apiFilters: Record<string, string | undefined>;
}

/**
 * Parse a page's filter spec off the loader URL. Text is trimmed; enum values are
 * kept only if they match a declared option (else dropped); date-range endpoints
 * become ISO day-bounds. Both loader and component import the same `spec`, so the
 * parsed keys and the rendered controls can never drift.
 */
export function readListFilters(
  searchParams: URLSearchParams,
  spec: FilterSpec,
): ReadListFiltersResult {
  const filters: Record<string, string> = {};
  const apiFilters: Record<string, string | undefined> = {};

  for (const field of spec) {
    if (field.kind === 'text') {
      const raw = searchParams.get(field.key)?.trim() ?? '';
      filters[field.key] = raw;
      apiFilters[field.key] = raw || undefined;
    } else if (field.kind === 'enum') {
      const raw = searchParams.get(field.key) ?? '';
      const valid = field.options.some((o) => o.value === raw);
      filters[field.key] = valid ? raw : '';
      apiFilters[field.key] = valid ? raw : undefined;
    } else {
      const from = searchParams.get(field.fromKey) ?? '';
      const to = searchParams.get(field.toKey) ?? '';
      filters[field.fromKey] = from;
      filters[field.toKey] = to;
      apiFilters[field.fromKey] = boundIso(from, 'start');
      apiFilters[field.toKey] = boundIso(to, 'end');
    }
  }
  return { filters, apiFilters };
}

/** True if any filter value is non-empty (drives the "Xoá lọc" affordance + empty-state copy). */
export function hasActiveFilters(filters: Record<string, string>): boolean {
  return Object.values(filters).some((v) => v !== '');
}
