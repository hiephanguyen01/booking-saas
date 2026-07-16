import { cn } from '@booking/ui/lib/utils';
import type { ComponentProps } from 'react';

/**
 * The storefront's standard content panel: a semantic `<section>` carrying the
 * shared surface treatment.
 *
 * This replaces ten hand-written surfaces that had drifted apart — six copies of
 * `rounded-lg bg-background p-4 shadow-[0_1px_5px_rgba(16,24,40,0.06)] sm:p-6`
 * on the listing group page and four of checkout's
 * `bg-white p-5 shadow-[0_0_16px_rgba(0,0,0,0.04)]`. Both arbitrary shadows
 * collapse onto the `shadow-sm` scale, and `bg-card` is the token the design
 * system assigns to panels.
 *
 * It stays a real `<section>` (rather than wrapping `@booking/ui`'s `Card`, which
 * renders a `<div>`) so callers keep their `aria-labelledby` heading association.
 */
export function SectionCard({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      className={cn('rounded-lg bg-card p-4 text-card-foreground shadow-sm sm:p-6', className)}
      {...props}
    />
  );
}
