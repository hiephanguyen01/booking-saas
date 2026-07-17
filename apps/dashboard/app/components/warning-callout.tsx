import type { ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { cn } from '@booking/ui/lib/utils';

/**
 * Warning surface for degraded / override states — the bordered
 * `border-warning/40 bg-warning/10` box with a TriangleAlert that the
 * moderation review pages repeat. One component so the copies can't drift.
 */
export function WarningCallout({
  title,
  children,
  className,
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm',
        className,
      )}
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1 text-foreground">
        {title ? <p className="font-medium">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}
