import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@booking/ui/lib/utils';

export interface EntityRefProps {
  /** Route to the entity; when absent (no id resolved) the `fallback` renders. */
  to: string | null | undefined;
  name: ReactNode;
  /** Shown when `to` is missing. Defaults to an em dash. */
  fallback?: ReactNode;
  className?: string;
}

/**
 * A link to another dashboard entity (partner, listing, tenant…) with the
 * standard primary/underline treatment and a visible focus ring. When the id
 * could not be resolved (`to` is nullish), it degrades to a muted em dash rather
 * than a dead link.
 */
export function EntityRef({ to, name, fallback, className }: EntityRefProps) {
  if (!to) {
    return <span className="text-muted-foreground">{fallback ?? '—'}</span>;
  }
  return (
    <Link
      to={to}
      className={cn(
        'rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
    >
      {name}
    </Link>
  );
}
