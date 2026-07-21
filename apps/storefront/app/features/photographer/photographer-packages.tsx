import type { PublicListingDetailResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@booking/ui/components/ui/empty';
import { cn } from '@booking/ui/lib/utils';
import { Aperture, Check, Clock3, FileImage, Images } from 'lucide-react';
import { SectionCard } from '../../components/section-card';
import { NsI18n, useTranslation } from '../../lib/i18n';
import type { PublicPackageOption } from '../../lib/package-options';
import { formatVnd } from '../../lib/ui';
import { packageDurationHours, photographerDetails } from './photographer-data';

export function PhotographerPackages({
  listing,
  packages,
  selectedId,
  onSelect,
}: {
  listing: PublicListingDetailResponse;
  packages: PublicPackageOption[];
  selectedId: string | null;
  onSelect: (packageId: string, trigger: HTMLButtonElement) => void;
}) {
  const { t } = useTranslation(NsI18n.Listing);

  return (
    <SectionCard
      id="photographer-packages"
      aria-labelledby="photographer-packages-title"
      className="scroll-mt-28"
    >
      <h2 id="photographer-packages-title" className="text-base font-semibold">
        {t('photographer.servicePackages')}
      </h2>

      {!packages.length ? (
        <Empty className="mt-5 border border-dashed py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Aperture />
            </EmptyMedia>
            <EmptyTitle>{t('photographer.noPackagesTitle')}</EmptyTitle>
            <EmptyDescription>{t('photographer.noPackagesBody')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="mt-5 hidden overflow-hidden rounded-md border xl:block">
            <table className="w-full table-fixed text-left text-sm">
              <caption className="sr-only">{t('photographer.tableLabel')}</caption>
              <thead className="bg-muted/70 text-xs font-semibold">
                <tr>
                  <th scope="col" className="w-[36%] p-4">
                    {t('photographer.colPackage')}
                  </th>
                  <th scope="col" className="w-[25%] border-l p-4">
                    {t('photographer.colRules')}
                  </th>
                  <th scope="col" className="w-[18%] border-l p-4">
                    {t('photographer.colPrice')}
                  </th>
                  <th scope="col" className="w-[21%] border-l p-4">
                    {t('photographer.colChoice')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {packages.map((item) => (
                  <PackageRow
                    key={item.id}
                    item={item}
                    listing={listing}
                    selected={selectedId === item.id}
                    onSelect={onSelect}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 grid gap-4 xl:hidden">
            {packages.map((item) => (
              <PackageCard
                key={item.id}
                item={item}
                listing={listing}
                selected={selectedId === item.id}
                onSelect={onSelect}
              />
            ))}
          </div>
        </>
      )}
    </SectionCard>
  );
}

function PackageRow({ item, listing, selected, onSelect }: PackageProps) {
  return (
    <tr className={cn('border-t align-top', selected && 'bg-primary/5')}>
      <td className="p-5">
        <PackageSummary item={item} listing={listing} />
      </td>
      <td className="border-l p-5">
        <PackageFacts item={item} listing={listing} />
      </td>
      <td className="border-l p-5">
        <PackagePrice item={item} />
      </td>
      <td className="border-l p-5">
        <PackageChoice item={item} listing={listing} selected={selected} onSelect={onSelect} />
      </td>
    </tr>
  );
}

function PackageCard(props: PackageProps) {
  return (
    <article
      className={cn(
        'overflow-hidden rounded-lg border bg-card',
        props.selected && 'border-primary bg-primary/5',
      )}
    >
      <PackagePhotoStrip photos={props.item.photos} title={props.item.name} />
      <div className="grid gap-5 p-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <PackageSummary {...props} hidePhotos />
        </div>
        <PackageFacts item={props.item} listing={props.listing} />
        <PackagePrice item={props.item} />
        <div className="sm:col-span-2">
          <PackageChoice {...props} />
        </div>
      </div>
    </article>
  );
}

interface PackageProps {
  item: PublicPackageOption;
  listing: PublicListingDetailResponse;
  selected: boolean;
  onSelect: (packageId: string, trigger: HTMLButtonElement) => void;
}

function PackageSummary({
  item,
  listing,
  hidePhotos = false,
}: Pick<PackageProps, 'item' | 'listing'> & { hidePhotos?: boolean }) {
  const { t } = useTranslation(NsI18n.Listing);
  const details = photographerDetails(listing.attributes);
  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold">{item.name}</h3>
      {!hidePhotos ? <PackagePhotoStrip photos={item.photos} title={item.name} /> : null}
      <p className="text-sm leading-6 text-muted-foreground">
        {item.description || t('photographer.packageDescriptionFallback')}
      </p>
      {details.style ? (
        <p className="flex items-start gap-2 text-sm">
          <Aperture className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          {t('photographer.photographyStyle', { value: details.style })}
        </p>
      ) : null}
    </div>
  );
}

function PackageFacts({ item, listing }: Pick<PackageProps, 'item' | 'listing'>) {
  const { t } = useTranslation(NsI18n.Listing);
  const details = photographerDetails(listing.attributes);
  return (
    <div className="space-y-3 text-sm">
      <p className="flex items-start gap-2">
        <Clock3 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        {t('photographer.packageDuration', { count: packageDurationHours(item) })}
      </p>
      {details.editedPhotos !== null ? (
        <p className="flex items-start gap-2">
          <Images className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          {t('photographer.editedPhotos', { count: details.editedPhotos })}
        </p>
      ) : null}
      {details.rawFiles !== null ? (
        <p className="flex items-start gap-2">
          <FileImage className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          {t(
            details.rawFiles ? 'photographer.rawFilesIncluded' : 'photographer.rawFilesNotIncluded',
          )}
        </p>
      ) : null}
    </div>
  );
}

function PackagePrice({ item }: { item: PublicPackageOption }) {
  const { t } = useTranslation(NsI18n.Listing);
  return (
    <div>
      <strong className="text-lg text-primary">{formatVnd(item.price)}</strong>
      <p className="mt-1 text-xs text-muted-foreground">
        {t('photographer.packageDuration', { count: packageDurationHours(item) })}
      </p>
    </div>
  );
}

function PackageChoice({ item, listing, selected, onSelect }: PackageProps) {
  const { t } = useTranslation(NsI18n.Listing);
  return (
    <div>
      <Button
        type="button"
        variant={selected ? 'secondary' : 'default'}
        className="w-full"
        onClick={(event) => onSelect(item.id, event.currentTarget)}
      >
        {selected ? <Check aria-hidden="true" /> : null}
        {t(selected ? 'photographer.selectedPackage' : 'photographer.selectPackage')}
      </Button>
      <div className="mt-4 space-y-2 text-xs text-muted-foreground">
        <p className="flex items-start gap-2">
          <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
          {listing.depositPercent > 0
            ? t('group.policyDepositPercent', { percent: listing.depositPercent })
            : t('group.policyDeposit')}
        </p>
        {listing.effectiveCancellationPolicy ? (
          <p className="flex items-start gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
            {listing.effectiveCancellationPolicy.name}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PackagePhotoStrip({ photos, title }: { photos: string[]; title: string }) {
  const visible = photos.slice(0, 3);
  if (!visible.length) {
    return (
      <div className="grid h-36 place-items-center rounded-md bg-muted text-muted-foreground">
        <Images className="size-6" aria-hidden="true" />
      </div>
    );
  }
  return (
    <div className="grid h-36 grid-cols-[2fr_1fr] gap-2 overflow-hidden rounded-md">
      <img src={visible[0]} alt={title} className="size-full object-cover" />
      <div className="grid gap-2 overflow-hidden">
        {[visible[1], visible[2]].map((photo, index) =>
          photo ? (
            <img key={photo} src={photo} alt="" className="min-h-0 size-full object-cover" />
          ) : (
            <span key={index} className="bg-muted" />
          ),
        )}
      </div>
    </div>
  );
}
