import type { PublicListingDetailResponse } from '@booking/contracts';
import { PackageMediaViewerDialog } from '@booking/ui/components/media/package-media-viewer-dialog';
import { Button } from '@booking/ui/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@booking/ui/components/ui/empty';
import { cn } from '@booking/ui/lib/utils';
import { Aperture, Check, Expand } from 'lucide-react';
import { useMediaGallery, usePhotoMediaItems } from '~/hooks/use-media-gallery';
import { SectionCard } from '~/components/section-card';
import { NsI18n, useTranslation } from '@booking/i18n';
import { packageDurationLabel, type PublicPackageOption } from '~/lib/package-options';
import { useMediaViewerLabels } from '~/hooks/use-media-viewer-labels';
import { formatVnd } from '~/lib/ui';
import { PackageMediaDetails } from '~/components/package-media-details';
import { RoomPhotoStrip } from '~/components/room-photo-strip';
import { GuestCapacityRules } from '~/components/guest-capacity-rules';
import { OfferingDetailsDisclosure } from '~/components/offering-details-disclosure';
import { specCards } from '~/lib/listing-attributes';
import { PANEL_SURFACE } from '~/constants/surfaces';

/** Stable identity so the media-items memo does not rebuild while nothing is open. */
const EMPTY_PHOTOS: string[] = [];

export function PackageTable({
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
  const viewerLabels = useMediaViewerLabels();
  const gallery = useMediaGallery(packages, (item) => item.id);
  const activePackage = gallery.item;
  const mediaItems = usePhotoMediaItems(
    activePackage?.photos ?? EMPTY_PHOTOS,
    activePackage?.name ?? '',
  );

  return (
    <SectionCard
      id="packages"
      aria-labelledby="packages-title"
      className="scroll-mt-20 md:scroll-mt-28"
    >
      <h2 id="packages-title" className="text-base font-semibold">
        {t('packages.servicePackages')}
      </h2>

      {!packages.length ? (
        <Empty className="mt-5 border border-dashed py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Aperture />
            </EmptyMedia>
            <EmptyTitle>{t('packages.noPackagesTitle')}</EmptyTitle>
            <EmptyDescription>{t('packages.noPackagesBody')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="mt-5 hidden overflow-hidden rounded-md border xl:block">
            <table className="w-full table-fixed text-left text-sm">
              <caption className="sr-only">{t('packages.tableLabel')}</caption>
              <thead className="bg-muted/70 text-xs font-semibold">
                <tr>
                  <th scope="col" className="w-[36%] p-4">
                    {t('packages.colPackage')}
                  </th>
                  <th scope="col" className="w-[25%] border-l p-4">
                    {t('group.colCapacity')}
                  </th>
                  <th scope="col" className="w-[18%] border-l p-4">
                    {t('packages.colPrice')}
                  </th>
                  <th scope="col" className="w-[21%] border-l p-4">
                    {t('packages.colChoice')}
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
                    onOpenMedia={gallery.open}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid gap-3 md:mt-5 md:gap-4 xl:hidden">
            {packages.map((item) => (
              <PackageCard
                key={item.id}
                item={item}
                listing={listing}
                selected={selectedId === item.id}
                onSelect={onSelect}
                onOpenMedia={gallery.open}
              />
            ))}
          </div>
        </>
      )}

      <PackageMediaViewerDialog
        {...gallery.dialogProps}
        items={mediaItems}
        labels={viewerLabels}
        title={activePackage?.name ?? t('packages.servicePackages')}
        description={t('packages.mediaViewerDescription', {
          name: activePackage?.name ?? t('packages.servicePackages'),
        })}
        details={
          activePackage ? <PackageMediaDetails item={activePackage} listing={listing} /> : null
        }
      />
    </SectionCard>
  );
}

function PackageRow({ item, listing, selected, onSelect, onOpenMedia }: PackageProps) {
  return (
    <tr className={cn('border-t align-top', selected && 'bg-primary/5')}>
      <td className="p-5">
        <PackageSummary item={item} listing={listing} onOpenMedia={onOpenMedia} />
      </td>
      <td className="border-l p-5">
        <GuestCapacityRules capacity={listing.capacity} />
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
        PANEL_SURFACE,
        'overflow-hidden bg-card md:border md:border-border',
        props.selected && 'border-primary bg-primary/5',
      )}
    >
      <PackagePhotoStrip
        photos={props.item.photos}
        title={props.item.name}
        onOpenPhoto={(index, trigger) => props.onOpenMedia(props.item.id, index, trigger)}
      />
      <div className="grid grid-cols-2 gap-4 p-(--sf-surface-pad) md:gap-5 md:p-5">
        <div className="col-span-2">
          <PackageSummary {...props} hidePhotos />
        </div>
        <GuestCapacityRules capacity={props.listing.capacity} />
        <PackagePrice item={props.item} />
        <div className="col-span-2">
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
  onOpenMedia: (packageId: string, index: number, trigger: HTMLButtonElement) => void;
}

function PackageSummary({
  item,
  listing,
  onOpenMedia,
  hidePhotos = false,
}: Pick<PackageProps, 'item' | 'listing' | 'onOpenMedia'> & { hidePhotos?: boolean }) {
  const { t } = useTranslation(NsI18n.Listing);
  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold">{item.name}</h3>
      {!hidePhotos ? (
        <PackagePhotoStrip
          photos={item.photos}
          title={item.name}
          onOpenPhoto={(index, trigger) => onOpenMedia(item.id, index, trigger)}
        />
      ) : null}
      <p className="text-sm leading-6 text-muted-foreground">
        {item.description || t('packages.packageDescriptionFallback')}
      </p>
      <OfferingDetailsDisclosure cards={specCards(listing.attributes, listing.attributeSchema)} />
    </div>
  );
}

function PackagePrice({ item }: { item: PublicPackageOption }) {
  const { t } = useTranslation(NsI18n.Listing);
  const duration = packageDurationLabel(item);
  return (
    <div>
      <strong className="text-lg text-primary">{formatVnd(item.price)}</strong>
      <p className="mt-1 text-xs text-muted-foreground">
        {t(duration.key, { count: duration.count })}
      </p>
    </div>
  );
}

function PackageChoice({
  item,
  listing,
  selected,
  onSelect,
}: Pick<PackageProps, 'item' | 'listing' | 'selected' | 'onSelect'>) {
  const { t } = useTranslation(NsI18n.Listing);
  return (
    <div>
      <Button
        type="button"
        size="control"
        variant={selected ? 'secondary' : 'default'}
        className="w-full"
        onClick={(event) => onSelect(item.id, event.currentTarget)}
      >
        {selected ? <Check aria-hidden="true" /> : null}
        {t(selected ? 'packages.selectedPackage' : 'packages.selectPackage')}
      </Button>
      <div className="mt-4 space-y-2 text-xs text-muted-foreground">
        <p className="flex items-start gap-2">
          <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />
          {listing.depositPercent > 0
            ? t('group.policyDepositPercent', { percent: listing.depositPercent })
            : t('group.policyDeposit')}
        </p>
        {listing.effectiveCancellationPolicy ? (
          <p className="flex items-start gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />
            {listing.effectiveCancellationPolicy.name}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PackagePhotoStrip({
  photos,
  title,
  onOpenPhoto,
}: {
  photos: string[];
  title: string;
  onOpenPhoto: (index: number, trigger: HTMLButtonElement) => void;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  return (
    <RoomPhotoStrip
      photos={photos}
      title={title}
      onOpenPhoto={onOpenPhoto}
      photoLabel={(index) => t('packages.viewPackagePhoto', { name: title, index })}
      coverBadge={
        <span className="absolute right-2 bottom-2 grid size-8 place-items-center rounded-full bg-card/90 text-card-foreground shadow-sm">
          <Expand className="size-3.5" aria-hidden="true" />
        </span>
      }
    />
  );
}
