import type { PublicListingDetailResponse } from '@booking/contracts';
import type { MediaViewerItem } from '@booking/ui/components/media/media-viewer-dialog';
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
import { Aperture, Check, Clock3, Expand, FileImage, Images } from 'lucide-react';
import { useRef, useState } from 'react';
import { SectionCard } from '~/components/section-card';
import { NsI18n, useTranslation } from '@booking/i18n';
import type { PublicPackageOption } from '~/lib/package-options';
import { useMediaViewerLabels } from '~/hooks/use-media-viewer-labels';
import { formatVnd } from '~/lib/ui';
import { packageDetails, packageDurationHours } from '~/lib/package-details';
import { PackageMediaDetails } from '~/components/package-media-details';

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
  const [activeMedia, setActiveMedia] = useState<{ packageId: string; index: number } | null>(null);
  const mediaTriggerRef = useRef<HTMLButtonElement | null>(null);
  const activePackage = activeMedia
    ? (packages.find((item) => item.id === activeMedia.packageId) ?? null)
    : null;
  const mediaItems: MediaViewerItem[] =
    activePackage?.photos.map((photo, index) => ({
      kind: 'image',
      url: photo,
      alt: t('group.photoAlt', { title: activePackage.name, index: index + 1 }),
    })) ?? [];

  function openPackageMedia(packageId: string, index: number, trigger: HTMLButtonElement): void {
    mediaTriggerRef.current = trigger;
    setActiveMedia({ packageId, index });
  }

  return (
    <SectionCard id="packages" aria-labelledby="packages-title" className="scroll-mt-28">
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
                    {t('packages.colRules')}
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
                    onOpenMedia={openPackageMedia}
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
                onOpenMedia={openPackageMedia}
              />
            ))}
          </div>
        </>
      )}

      <PackageMediaViewerDialog
        open={Boolean(activePackage)}
        items={mediaItems}
        activeIndex={activeMedia?.index ?? 0}
        onOpenChange={(open) => {
          if (!open) setActiveMedia(null);
        }}
        onActiveIndexChange={(index) => {
          setActiveMedia((current) => (current ? { ...current, index } : current));
        }}
        labels={viewerLabels}
        title={activePackage?.name ?? t('packages.servicePackages')}
        description={t('packages.mediaViewerDescription', {
          name: activePackage?.name ?? t('packages.servicePackages'),
        })}
        returnFocusRef={mediaTriggerRef}
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
      <PackagePhotoStrip
        photos={props.item.photos}
        title={props.item.name}
        onOpenPhoto={(index, trigger) => props.onOpenMedia(props.item.id, index, trigger)}
      />
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
  onOpenMedia: (packageId: string, index: number, trigger: HTMLButtonElement) => void;
}

function PackageSummary({
  item,
  listing,
  onOpenMedia,
  hidePhotos = false,
}: Pick<PackageProps, 'item' | 'listing' | 'onOpenMedia'> & { hidePhotos?: boolean }) {
  const { t } = useTranslation(NsI18n.Listing);
  const details = packageDetails(listing.attributes);
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
      {details.style ? (
        <p className="flex items-start gap-2 text-sm">
          <Aperture className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          {t('packages.photographyStyle', { value: details.style })}
        </p>
      ) : null}
    </div>
  );
}

function PackageFacts({ item, listing }: Pick<PackageProps, 'item' | 'listing'>) {
  const { t } = useTranslation(NsI18n.Listing);
  const details = packageDetails(listing.attributes);
  return (
    <div className="space-y-3 text-sm">
      <p className="flex items-start gap-2">
        <Clock3 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        {t('packages.packageDuration', { count: packageDurationHours(item) })}
      </p>
      {details.editedPhotos !== null ? (
        <p className="flex items-start gap-2">
          <Images className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          {t('packages.editedPhotos', { count: details.editedPhotos })}
        </p>
      ) : null}
      {details.rawFiles !== null ? (
        <p className="flex items-start gap-2">
          <FileImage className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          {t(details.rawFiles ? 'packages.rawFilesIncluded' : 'packages.rawFilesNotIncluded')}
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
        {t('packages.packageDuration', { count: packageDurationHours(item) })}
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
        variant={selected ? 'secondary' : 'default'}
        className="w-full"
        onClick={(event) => onSelect(item.id, event.currentTarget)}
      >
        {selected ? <Check aria-hidden="true" /> : null}
        {t(selected ? 'packages.selectedPackage' : 'packages.selectPackage')}
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
      <button
        type="button"
        onClick={(event) => onOpenPhoto(0, event.currentTarget)}
        aria-label={t('packages.viewPackagePhoto', { name: title, index: 1 })}
        className="group relative min-h-0 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <img
          src={visible[0]}
          alt={title}
          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
        <span className="absolute right-2 bottom-2 grid size-8 place-items-center rounded-full bg-card/90 text-card-foreground shadow-sm">
          <Expand className="size-3.5" aria-hidden="true" />
        </span>
      </button>
      <div className="grid gap-2 overflow-hidden">
        {[visible[1], visible[2]].map((photo, index) =>
          photo ? (
            <button
              key={photo}
              type="button"
              onClick={(event) => onOpenPhoto(index + 1, event.currentTarget)}
              aria-label={t('packages.viewPackagePhoto', {
                name: title,
                index: index + 2,
              })}
              className="min-h-0 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <img src={photo} alt="" className="size-full object-cover" />
            </button>
          ) : (
            <span key={index} className="bg-muted" />
          ),
        )}
      </div>
    </div>
  );
}
