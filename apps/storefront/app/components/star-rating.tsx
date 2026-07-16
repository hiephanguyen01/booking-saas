import { cn } from '@booking/ui/lib/utils';
import { Star } from 'lucide-react';

/**
 * The one definition of rating-star gold.
 *
 * Ratings are a universal semantic (like success green) rather than tenant
 * branding, so this colour is deliberately not driven by `theme_config` — but it
 * lives here alone so every surface agrees. Previously the same five stars were
 * drawn in four different colours across the app.
 */
const STAR_GOLD = 'text-amber-500';

const STAR_SIZE = {
  sm: 'size-3',
  md: 'size-4',
  lg: 'size-4.5',
} as const;

export type StarSize = keyof typeof STAR_SIZE;

/** A single decorative star — for filter chips and inline affordances. */
export function RatingStar({ className }: { className?: string }) {
  return <Star aria-hidden="true" className={cn(STAR_GOLD, 'fill-current', className)} />;
}

/**
 * A five-star rating readout. Renders one accessible label and hides the stars
 * themselves from assistive tech, so a screen reader hears "4.8 out of 5 stars"
 * rather than five separate icons.
 */
export function StarRating({
  rating,
  size = 'md',
  className,
  label,
}: {
  rating: number;
  size?: StarSize;
  className?: string;
  /** Overrides the default localized "{rating} out of 5 stars" label. */
  label?: string;
}) {
  const filled = Math.round(rating);
  return (
    <span
      className={cn('inline-flex items-center gap-0.5', STAR_GOLD, className)}
      aria-label={label ?? `${rating.toFixed(1)}/5`}
      role="img"
    >
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={index}
          aria-hidden="true"
          className={cn(STAR_SIZE[size], index < filled && 'fill-current')}
        />
      ))}
    </span>
  );
}
