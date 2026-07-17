import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@booking/ui/components/ui/button';
import { cn } from '@booking/ui/lib/utils';

/**
 * Ghost back-navigation button at the top of detail / new / edit screens.
 * One component so the ~20 hand-rolled copies can't drift in spacing/tone.
 */
export function BackLink({
  to,
  label,
  className,
}: {
  to: string;
  label: string;
  className?: string;
}) {
  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className={cn('-ml-2 w-fit text-muted-foreground', className)}
    >
      <Link to={to} prefetch="intent">
        <ArrowLeft className="size-4" /> {label}
      </Link>
    </Button>
  );
}
