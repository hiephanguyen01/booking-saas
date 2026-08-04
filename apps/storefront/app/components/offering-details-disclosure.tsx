import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@booking/ui/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { NsI18n, useTranslation } from '@booking/i18n';
import { AttributeSpecCards } from '~/components/attribute-spec-cards';
import type { SpecCard } from '~/lib/listing-attributes';

export function OfferingDetailsDisclosure({
  cards,
  description,
  emptyLabel,
}: {
  cards: SpecCard[];
  description?: string | null;
  emptyLabel?: string;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  if (!cards.length && !description) {
    return emptyLabel ? <span className="text-muted-foreground">{emptyLabel}</span> : null;
  }

  return (
    <Collapsible>
      <CollapsibleTrigger className="inline-flex min-h-11 items-center gap-1 font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {t('group.viewRoomDetails')}
        <ChevronDown className="size-4" aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-4 pt-3">
        <AttributeSpecCards cards={cards} />
        {description ? <p className="leading-6 text-muted-foreground">{description}</p> : null}
      </CollapsibleContent>
    </Collapsible>
  );
}
