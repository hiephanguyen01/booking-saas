import { Button } from '@booking/ui/components/ui/button';
import { Spinner } from '@booking/ui/components/ui/spinner';
import { cn } from '@booking/ui/lib/utils';
import type { ComponentProps, ReactNode } from 'react';
import { Link, useNavigation, useResolvedPath } from 'react-router';

/**
 * True only while a navigation to `to` is in flight.
 *
 * `useNavigation().state` is global, so testing it alone lights up every pending
 * affordance on the page at once — click one room's "Chọn" and all of them
 * spin. Comparing against the resolved target scopes the feedback to the link
 * the user actually activated. Safe without a basename (see react-router.config.ts).
 */
export function useIsNavigatingTo(to: string): boolean {
  const navigation = useNavigation();
  const path = useResolvedPath(to);
  return (
    navigation.state !== 'idle' &&
    navigation.location?.pathname === path.pathname &&
    navigation.location?.search === path.search
  );
}

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
