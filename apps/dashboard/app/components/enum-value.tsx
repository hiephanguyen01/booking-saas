import type { ReactNode } from 'react';

export interface EnumValueProps<T extends string> {
  /** Exhaustive label map — a missing enum member is a compile error at the call site. */
  map: Record<T, string>;
  value: T;
  /** Shown when `value` is not in `map` (bad/stale data). Defaults to an em dash. */
  fallback?: ReactNode;
  className?: string;
}

/**
 * A typed enum → Vietnamese label lookup. Because `map` is `Record<T, string>`,
 * the compiler forces every member to have a label; if a runtime value falls
 * outside the enum it renders the `fallback` (an em dash), never the raw slug.
 */
export function EnumValue<T extends string>({ map, value, fallback, className }: EnumValueProps<T>) {
  const label = (map as Record<string, string | undefined>)[value];
  if (label === undefined) {
    return <span className={className}>{fallback ?? <span className="text-muted-foreground">—</span>}</span>;
  }
  return <span className={className}>{label}</span>;
}
