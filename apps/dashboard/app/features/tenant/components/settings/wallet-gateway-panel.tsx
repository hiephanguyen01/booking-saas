import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@booking/ui/components/ui/collapsible';
import { Button } from '@booking/ui/components/ui/button';
import { ChevronDown, Plus } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * One e-wallet's slot in the payments section.
 *
 * An enabled wallet keeps its form open — it is live money movement and the
 * operator came here to inspect or change it. A wallet that has never been
 * connected collapses to a single row: its credential form is long, and three of
 * them expanded made a screen the operator has to scroll past to reach anything
 * else. `defaultOpen` also re-opens the panel after a failed save so the server
 * error stays with the fields that caused it.
 */
export function WalletGatewayPanel({
  label,
  enabled,
  forceOpen = false,
  children,
}: {
  label: string;
  enabled: boolean;
  /** Keep the body open despite being disabled — e.g. a save just failed here. */
  forceOpen?: boolean;
  children: ReactNode;
}) {
  const open = enabled || forceOpen;

  return (
    <Collapsible defaultOpen={open} className="group rounded-xl border">
      <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-2.5">
        <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <span
            aria-hidden="true"
            className={
              enabled ? 'size-2 shrink-0 rounded-full bg-success' : 'size-2 shrink-0 rounded-full bg-muted-foreground/40'
            }
          />
          <span className="truncate">
            {enabled ? `Đang bật ${label}` : `Chưa bật ${label}`}
          </span>
        </p>
        <CollapsibleTrigger asChild>
          <Button type="button" variant={enabled ? 'ghost' : 'outline'} size="sm" className="shrink-0">
            {enabled ? (
              <>
                Cấu hình
                <ChevronDown
                  className="size-4 transition-transform group-has-data-[state=open]:rotate-180"
                  aria-hidden="true"
                />
              </>
            ) : (
              <>
                <Plus className="size-4" aria-hidden="true" />
                Bật {label}
              </>
            )}
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="border-t px-4 py-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
