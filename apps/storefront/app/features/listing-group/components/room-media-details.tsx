import type { AttributeField } from '@booking/contracts';
import { NsI18n, useTranslation } from '@booking/i18n';
import type { RoomOption } from '~/features/listing-group/lib/listing-group-types';
import { listingCapacity, specCards } from '~/lib/listing-attributes';
import { AttributeSpecCards } from '~/components/attribute-spec-cards';

/**
 * The side panel shown next to a room photo in the media viewer — the room's title,
 * description and icon-led attribute spec cards, mirroring the package media viewer.
 */
export function RoomMediaDetails({
  option,
  attributeSchema,
}: {
  option: RoomOption;
  attributeSchema: AttributeField[];
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const cards = specCards(option.child.attributes, attributeSchema);
  const description = option.detail.description || option.child.description;
  const capacity = listingCapacity(option.child.capacity);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl leading-9 font-semibold text-card-foreground">
          {option.child.title}
        </h2>
        {description ? (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {capacity ? (
        <p className="text-sm text-muted-foreground">{t('group.maxGuests', { count: capacity })}</p>
      ) : null}
      <AttributeSpecCards cards={cards} />
    </div>
  );
}
