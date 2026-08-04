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
      // Radius, padding, border and shadow come from `--sf-surface-*` rather than
      // fixed utilities so a tenant's surface settings reach this panel — it is
      // hand-rolled, not a shadcn `Card`, so it inherits nothing on its own.
      className={cn(
        'bg-card text-card-foreground rounded-(--sf-surface-radius) [border:var(--sf-surface-border-width)_solid_var(--sf-surface-border-color)] shadow-(--sf-surface-shadow) p-(--sf-surface-pad)',
        className,
      )}
      {...props}
    />
  );
}
