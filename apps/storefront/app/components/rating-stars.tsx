import { Star } from 'lucide-react';

const STAR_FILL_WIDTHS = [
  'w-0',
  'w-[5%]',
  'w-[10%]',
  'w-[15%]',
  'w-[20%]',
  'w-[25%]',
  'w-[30%]',
  'w-[35%]',
  'w-[40%]',
  'w-[45%]',
  'w-1/2',
  'w-[55%]',
  'w-[60%]',
  'w-[65%]',
  'w-[70%]',
  'w-3/4',
  'w-[80%]',
  'w-[85%]',
  'w-[90%]',
  'w-[95%]',
  'w-full',
] as const;

export function RatingStars({ rating, className = '' }: { rating: number; className?: string }) {
  const normalized = Math.min(5, Math.max(0, rating));

  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`${rating}/5`}>
      {[0, 1, 2, 3, 4].map((index) => {
        const fillPercent = Math.min(100, Math.max(0, (normalized - index) * 100));
        const fillWidth = STAR_FILL_WIDTHS[Math.round(fillPercent / 5)] ?? 'w-0';
        return (
          <span key={index} className="relative size-4 shrink-0" aria-hidden="true">
            <Star className="absolute inset-0 size-4 text-amber-500" />
            {fillPercent > 0 ? (
              <span className={`absolute inset-y-0 left-0 overflow-hidden ${fillWidth}`}>
                <Star className="size-4 min-w-4 text-amber-500" fill="currentColor" />
              </span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}
