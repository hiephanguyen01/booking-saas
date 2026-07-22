import type { ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from './tooltip';

export function InfoHint({ children, label = 'Giải thích' }: { children: ReactNode; label?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-flex text-muted-foreground hover:text-foreground"
        >
          <CircleHelp className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-pretty">{children}</TooltipContent>
    </Tooltip>
  );
}
