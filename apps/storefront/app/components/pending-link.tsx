import { Button } from '@booking/ui/components/ui/button';
import { Spinner } from '@booking/ui/components/ui/spinner';
import { cn } from '@booking/ui/lib/utils';
import type { ComponentProps, ReactNode } from 'react';
import { Link } from 'react-router';
import { useIsNavigatingTo } from '~/hooks/use-is-navigating-to';

/**
 * A `Button`-styled `Link` that shows a spinner while navigating to its own
 * target, and stops swallowing clicks/focus in the meantime.
 */
export function PendingLink({
  to,
  children,
  pendingLabel,
  className,
  ...buttonProps
}: {
  to: string;
  children: ReactNode;
  /** Replaces the label while the navigation is in flight. */
  pendingLabel: string;
} & Omit<ComponentProps<typeof Button>, 'asChild' | 'children'>) {
  const pending = useIsNavigatingTo(to);
  return (
    <Button asChild className={className} aria-disabled={pending || undefined} {...buttonProps}>
      <Link
        to={to}
        className={cn(pending && 'pointer-events-none')}
        aria-disabled={pending || undefined}
        tabIndex={pending ? -1 : undefined}
      >
        {pending ? <Spinner data-icon="inline-start" /> : null}
        {pending ? pendingLabel : children}
      </Link>
    </Button>
  );
}
