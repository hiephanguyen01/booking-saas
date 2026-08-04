import { cn } from '@booking/ui/lib/utils';

/**
 * The "-N%" ribbon pinned to a listing photo.
 *
 * Both catalog cards carried a byte-identical copy of this markup, hand-written
 * `clip-path` polygon included, so the notch could drift between them.
 *
 * It reads `--sf-accent`, not `--success`. The status tokens mean something
 * happened — an operation succeeded, failed, needs attention — and a sale price
 * is not an outcome. The accent is the storefront's "worth noticing" signal:
 * louder than body text, but not an action the way `--primary` is.
 */
export function DiscountBadge({
  percent,
  className,
}: {
  percent: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'absolute top-6 left-0 flex h-10 w-18 items-center bg-brand-accent px-2 text-base font-semibold text-brand-accent-foreground',
        '[clip-path:polygon(0_0,100%_0,84%_50%,100%_100%,0_100%)]',
        className,
      )}
    >
      - {percent}%
    </span>
  );
}
