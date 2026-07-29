import type { PublicListingDetailResponse } from '@booking/contracts';
import { Clock3, WalletCards } from 'lucide-react';
import type { ReactNode } from 'react';
import { NsI18n, useTranslation } from '@booking/i18n';
import { AttributeSpecCards } from '~/components/attribute-spec-cards';
import { specCards } from '~/lib/listing-attributes';
import { packageDurationLabel, type PublicPackageOption } from '~/lib/package-options';
import { formatVnd } from '~/lib/ui';

/** Package metadata shared by package pages and booking dialogs. */
export function PackageMediaDetails({
  item,
  listing,
}: {
  item: PublicPackageOption;
  listing: PublicListingDetailResponse;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const duration = packageDurationLabel(item);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl leading-9 font-semibold text-card-foreground">{item.name}</h2>
        {item.description ? (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
        ) : null}
      </div>

      <div className="space-y-4">
        <Detail
          icon={<Clock3 />}
          label={t('duration')}
          value={t(duration.key, { count: duration.count })}
        />
        <Detail
          icon={<WalletCards />}
          label={t('packages.colPrice')}
          value={formatVnd(item.price) ?? item.price}
        />
        {/* Label, icon and order come from the listing type's tenant-authored
            attribute schema, so any vertical's packages describe themselves. */}
        <AttributeSpecCards cards={specCards(listing.attributes, listing.attributeSchema)} />
      </div>
    </div>
  );
}

function Detail({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center text-card-foreground [&_svg]:size-5">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm leading-5 font-semibold text-card-foreground">{label}</p>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">{value}</p>
      </div>
    </div>
  );
}
