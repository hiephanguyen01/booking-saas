import { cn } from '@booking/ui/lib/utils';
import { ChevronDown } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { NsI18n, useTranslation } from '@booking/i18n';
import { AttributeSpecCards } from '~/components/attribute-spec-cards';
import type { SpecCard } from '~/lib/listing-attributes';

export function OfferingDetailsDisclosure({
  cards,
  description,
  emptyLabel,
  collapsedSummary,
}: {
  cards: SpecCard[];
  description?: string | null;
  emptyLabel?: string;
  collapsedSummary?: ReactNode;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const [open, setOpen] = useState(false);
  const contentId = useId();

  if (!cards.length && !description) {
    if (collapsedSummary) return <>{collapsedSummary}</>;
    return emptyLabel ? <span className="text-muted-foreground">{emptyLabel}</span> : null;
  }

  return (
    <div data-state={open ? 'open' : 'closed'} className="flex flex-col">
      {collapsedSummary ? (
        <div
          aria-hidden={open}
          className={cn(
            'grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none',
            open ? 'pointer-events-none grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100',
          )}
        >
          <div className="min-h-0 overflow-hidden">{collapsedSummary}</div>
        </div>
      ) : null}

      <div
        id={contentId}
        aria-hidden={!open}
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none',
          open ? 'grid-rows-[1fr] opacity-100' : 'pointer-events-none grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-col gap-4 pt-3">
            <AttributeSpecCards cards={cards} />
            {description ? <p className="leading-6 text-muted-foreground">{description}</p> : null}
          </div>
        </div>
      </div>

      <button
        type="button"
        aria-controls={contentId}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="mt-1 inline-flex min-h-11 w-fit items-center gap-1 font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {open ? t('group.showLess') : t('group.viewRoomDetails')}
        <ChevronDown
          className={cn(
            'size-4 transition-transform duration-200 motion-reduce:transition-none',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}
