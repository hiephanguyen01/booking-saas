import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@booking/ui/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * The provider-side setup steps for one gateway (IPN/callback URL, signing, which
 * credentials belong to which environment).
 *
 * These are read once while wiring a gateway up and never again, but all three
 * gateways rendered them permanently expanded — together they were most of the
 * payments screen's height. Behind a disclosure they stay one click away without
 * standing between the operator and the fields they came to change.
 */
export function GatewaySetupNotes({
  title,
  steps,
  footnote,
}: {
  title: string;
  steps: ReactNode[];
  footnote: ReactNode;
}) {
  return (
    <Collapsible className="group mt-4">
      <CollapsibleTrigger className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-2.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {title}
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform group-has-data-[state=open]:rotate-180"
          aria-hidden="true"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="rounded-b-lg border border-t-0 bg-muted/15 px-4 py-3 text-xs leading-5 text-muted-foreground">
          <ol className="list-decimal space-y-1 pl-4">
            {steps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
          <p className="mt-2">{footnote}</p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
