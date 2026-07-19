import { Star } from 'lucide-react';

export function RatingStars({ rating, className = '' }: { rating: number; className?: string }) {
  const normalized = Math.min(5, Math.max(0, rating));

  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`${rating}/5`}>
      {[0, 1, 2, 3, 4].map((index) => {
        const fillPercent = Math.min(100, Math.max(0, (normalized - index) * 100));
        return (
          <span key={index} className="relative size-4 shrink-0" aria-hidden="true">
            <Star className="absolute inset-0 size-4 text-amber-500" />
            {fillPercent > 0 ? (
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${fillPercent}%` }}
              >
                <Star className="size-4 min-w-4 text-amber-500" fill="currentColor" />
              </span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}
