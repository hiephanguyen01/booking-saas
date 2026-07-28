import { cn } from '@booking/ui/lib/utils';
import { Info } from 'lucide-react';
import { LucideByName } from '~/components/lucide-by-name';
import { NsI18n, useTranslation } from '@booking/i18n';
import type { SpecCard } from '~/features/listing-group/lib/room-attributes';

/** One spec card: icon + label, then a single value or a bullet list. */
function SpecCardRow({ card }: { card: SpecCard }) {
  const { t } = useTranslation(NsI18n.Listing);
  return (
    <div className="flex items-start gap-2.5">
      <LucideByName
        name={card.icon}
        fallback={Info}
        className="mt-0.5 size-4 shrink-0 text-foreground"
      />
      <div className="min-w-0 flex-1">
        {card.kind === 'area' ? (
          <p className="text-sm text-muted-foreground">{t('group.area', { value: card.value })}</p>
        ) : (
          <>
            <p className="text-sm font-medium text-foreground">{card.label}</p>
            {card.kind === 'list' ? (
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-muted-foreground">
                {card.lines.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{card.line}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** The ordered stack of attribute spec cards. Shared so the detail page and the
 * room list never drift. Renders nothing when there are no cards. */
export function AttributeSpecCards({
  cards,
  className,
}: {
  cards: SpecCard[];
  className?: string;
}) {
  if (!cards.length) return null;
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {cards.map((card) => (
        <SpecCardRow key={card.key} card={card} />
      ))}
    </div>
  );
}
