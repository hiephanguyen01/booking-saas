import { cn } from '@booking/ui/lib/utils';
import type { ReactNode } from 'react';

export function MobileStickyActionBar({
  summary,
  action,
  className,
}: {
  summary?: ReactNode;
  action: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-(--sf-lip-shadow) backdrop-blur md:hidden',
        className,
      )}
    >
      <div className="mx-auto flex max-w-lg items-center gap-3">
        {summary ? <div className="min-w-0 flex-1">{summary}</div> : null}
        <div className={summary ? 'shrink-0' : 'w-full'}>{action}</div>
      </div>
    </div>
  );
}
