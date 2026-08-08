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
        // Pinned near the top corner and sized to the number it holds. It used to
        // stand 40px tall and start 24px down, which on a 112px grid thumbnail
        // covered a third of the photo.
        'absolute top-2.5 left-0 flex h-6 w-14 items-center rounded-r-xs bg-brand-accent px-2 text-xs font-bold text-brand-accent-foreground sm:h-7 sm:w-16 sm:text-sm',
        '[clip-path:polygon(0_0,100%_0,84%_50%,100%_100%,0_100%)]',
        className,
      )}
    >
      - {percent}%
    </span>
  );
}
