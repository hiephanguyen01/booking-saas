import { NsI18n, useTranslation } from '@booking/i18n';
import { Users } from 'lucide-react';
import { listingCapacity } from '~/lib/listing-attributes';

export function GuestCapacityRules({ capacity: rawCapacity }: { capacity: number | null }) {
  const { t } = useTranslation(NsI18n.Listing);
  const capacity = listingCapacity(rawCapacity);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-medium">{t('group.capacity')}</p>
        <p className="mt-2 flex items-center gap-2 text-muted-foreground">
          <Users className="size-4" aria-hidden="true" />
          {capacity ? t('group.maxGuests', { count: capacity }) : t('group.notProvided')}
        </p>
      </div>
      <div>
        <p className="font-medium">{t('group.surcharge')}</p>
        <p className="mt-2 text-muted-foreground">{t('group.surchargePolicy')}</p>
      </div>
    </div>
  );
}
