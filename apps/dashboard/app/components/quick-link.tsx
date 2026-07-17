import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@booking/ui/lib/utils';

/**
 * A prominent shortcut tile — icon + label + trailing arrow — for dashboard
 * overview pages. Generic across areas; gate rendering (permissions) at the
 * call site.
 */
export function QuickLink({
  to,
  icon,
  label,
  className,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-3 rounded-lg border bg-card p-4 text-sm font-medium transition-colors hover:bg-accent',
        className,
      )}
    >
      <span className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {icon}
      </span>
      {label}
      <ArrowUpRight className="ml-auto size-4 text-muted-foreground" />
    </Link>
  );
}
