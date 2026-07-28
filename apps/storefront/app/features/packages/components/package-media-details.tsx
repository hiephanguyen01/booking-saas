import type { PublicListingDetailResponse } from '@booking/contracts';
import { Aperture, Clock3, FileImage, Images, WalletCards } from 'lucide-react';
import type { ReactNode } from 'react';
import { NsI18n, useTranslation } from '~/lib/i18n';
import type { PublicPackageOption } from '~/lib/package-options';
import { formatVnd } from '~/lib/ui';
import { packageDetails, packageDurationHours } from '~/features/packages/lib/package-data';

export function PackageMediaDetails({
  item,
  listing,
}: {
  item: PublicPackageOption;
  listing: PublicListingDetailResponse;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const details = packageDetails(listing.attributes);

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
          value={t('packages.packageDuration', { count: packageDurationHours(item) })}
        />
        <Detail
          icon={<WalletCards />}
          label={t('packages.colPrice')}
          value={formatVnd(item.price) ?? item.price}
        />
        {details.style ? (
          <Detail
            icon={<Aperture />}
            label={t('packages.photographyStyleLabel')}
            value={details.style}
          />
        ) : null}
        {details.editedPhotos !== null ? (
          <Detail
            icon={<Images />}
            label={t('packages.postProduction')}
            value={t('packages.editedPhotos', { count: details.editedPhotos })}
          />
        ) : null}
        {details.rawFiles !== null ? (
          <Detail
            icon={<FileImage />}
            label={t('packages.originalFiles')}
            value={t(
              details.rawFiles ? 'packages.rawFilesIncluded' : 'packages.rawFilesNotIncluded',
            )}
          />
        ) : null}
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
