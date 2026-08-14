import type { AttributeField, HourlySlot } from '@booking/contracts';
import { PackageMediaViewerDialog } from '@booking/ui/components/media/package-media-viewer-dialog';
import { Button } from '@booking/ui/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@booking/ui/components/ui/empty';
import { Building2 } from 'lucide-react';
import { useMediaGallery, usePhotoMediaItems } from '~/hooks/use-media-gallery';
import { SectionCard } from '~/components/section-card';
import { NsI18n, useTranslation } from '@booking/i18n';
import { useMediaViewerLabels } from '~/hooks/use-media-viewer-labels';
import type { BookingMode, RoomOption } from '~/features/listing-group/lib/listing-group-types';
import { roomAvailabilityState } from '~/features/booking-widget/lib/slot-selection';
import { PolicyList, RoomAction, RoomDetails, RoomHeading, RoomPrice } from './room-cells';
import { RoomMediaDetails } from './room-media-details';
import { RoomPhotoStrip } from '~/components/room-photo-strip';
import { useRoomOptionsController } from '~/features/listing-group/hooks/use-room-options-controller';
import { GuestCapacityRules } from '~/components/guest-capacity-rules';
import { cn } from '@booking/ui/lib/utils';
import { PANEL_SURFACE } from '~/constants/surfaces';

/** Stable identity so the media-items memo does not rebuild while nothing is open. */
const EMPTY_PHOTOS: string[] = [];

export function RoomOptionsSection({
  roomOptions,
  attributeSchema,
  groupSlug,
  mode,
  date,
  hideUnavailableByDefault,
}: {
  roomOptions: RoomOption[];
  attributeSchema: AttributeField[];
  groupSlug: string;
  mode: BookingMode;
  date: string;
  hideUnavailableByDefault: boolean;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const viewerLabels = useMediaViewerLabels();
  const {
    browsing,
    hideUnavailable,
    slotsByRoom,
    toggleHideUnavailable,
    unavailableCount,
    visibleOptions,
  } = useRoomOptionsController({ hideUnavailableByDefault, roomOptions });
  const gallery = useMediaGallery(visibleOptions, (option) => option.child.id);
  // The desktop table and the mobile cards render the same rooms with the same
  // eight props; CSS decides which is visible.
  const cellProps = (option: RoomOption): RoomProps => ({
    option,
    attributeSchema,
    groupSlug,
    mode,
    date,
    slots: slotsByRoom.get(option.child.id) ?? [],
    onOpenMedia: gallery.open,
  });
  const activeRoom = gallery.item;
  const mediaItems = usePhotoMediaItems(
    activeRoom?.child.photos ?? EMPTY_PHOTOS,
    activeRoom?.child.title ?? '',
  );

  return (
    <SectionCard
      id="room-options"
      aria-labelledby="room-options-title"
      className="scroll-mt-20 max-md:rounded-none max-md:border-x-0 max-md:shadow-none md:scroll-mt-28"
    >
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="room-options-title" className="text-base font-semibold">
            {t('group.roomTypes')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {browsing
              ? t('group.chooseSchedulePerRoom')
              : mode === 'hourly'
                ? t('group.availabilityOn', { date })
                : t('group.availabilityRange')}
          </p>
        </div>
        {unavailableCount > 0 ? (
          <Button type="button" size="sm" variant="outline" onClick={toggleHideUnavailable}>
            {hideUnavailable
              ? t('group.showUnavailableRooms', { count: unavailableCount })
              : t('group.hideUnavailableRooms')}
          </Button>
        ) : null}
      </div>

      {visibleOptions.length ? (
        <>
          <div className="hidden overflow-hidden rounded-md border xl:block">
            <table className="w-full table-fixed text-left text-sm">
              <caption className="sr-only">{t('group.roomTableLabel')}</caption>
              <thead>
                <tr className="bg-muted/60 text-xs font-semibold">
                  <th scope="col" className="w-[34%] p-4">
                    {t('group.roomTypes')}
                  </th>
                  <th scope="col" className="w-[25%] border-l border-border p-4">
                    {t('group.colCapacity')}
                  </th>
                  <th scope="col" className="w-[20%] border-l border-border p-4">
                    {t('group.colPrice')}
                  </th>
                  <th scope="col" className="w-[21%] border-l border-border p-4">
                    {t('group.colChoice')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleOptions.map((option) => (
                  <RoomRow key={option.child.id} {...cellProps(option)} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 md:gap-4 xl:hidden">
            {visibleOptions.map((option) => (
              <RoomCard key={option.child.id} {...cellProps(option)} />
            ))}
          </div>
        </>
      ) : (
        <Empty className="border border-dashed py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Building2 />
            </EmptyMedia>
            <EmptyTitle>{t('group.noRoomsTitle')}</EmptyTitle>
            <EmptyDescription>{t('group.noRoomsBody')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <PackageMediaViewerDialog
        {...gallery.dialogProps}
        items={mediaItems}
        labels={viewerLabels}
        title={activeRoom?.child.title ?? t('group.roomTypes')}
        details={
          activeRoom ? (
            <RoomMediaDetails option={activeRoom} attributeSchema={attributeSchema} />
          ) : null
        }
      />
    </SectionCard>
  );
}

interface RoomProps {
  option: RoomOption;
  attributeSchema: AttributeField[];
  groupSlug: string;
  mode: BookingMode;
  date: string;
  slots: HourlySlot[];
  onOpenMedia: (roomId: string, index: number, trigger: HTMLButtonElement) => void;
}

function RoomRow({
  option,
  attributeSchema,
  groupSlug,
  mode,
  date,
  slots,
  onOpenMedia,
}: RoomProps) {
  const state = roomAvailabilityState(option);
  return (
    <tr className="border-t border-border align-top">
      <td className="min-w-0 p-5">
        <RoomDetails
          option={option}
          attributeSchema={attributeSchema}
          onOpenPhoto={(index, trigger) => onOpenMedia(option.child.id, index, trigger)}
        />
      </td>
      <td className="border-l border-border p-5">
        <GuestCapacityRules capacity={option.child.capacity} />
      </td>
      <td className="border-l border-border p-5">
        <RoomPrice option={option} mode={mode} state={state} />
      </td>
      <td className="border-l border-border p-5">
        <RoomAction
          option={option}
          groupSlug={groupSlug}
          mode={mode}
          date={date}
          state={state}
          slots={slots}
        />
        <PolicyList depositPercent={option.detail.depositPercent} />
      </td>
    </tr>
  );
}

function RoomCard({
  option,
  attributeSchema,
  groupSlug,
  mode,
  date,
  slots,
  onOpenMedia,
}: RoomProps) {
  const state = roomAvailabilityState(option);
  return (
    <article
      className={cn(
        PANEL_SURFACE,
        'grid overflow-hidden bg-card max-md:rounded-none md:grid-cols-[13rem_minmax(0,1fr)] md:grid-rows-[auto_1fr] md:border md:border-border',
      )}
    >
      <div className="p-(--sf-surface-pad) pb-3 md:col-start-2 md:row-start-1 md:pb-2">
        <RoomHeading option={option} />
      </div>
      <RoomPhotoStrip
        photos={option.child.photos}
        title={option.child.title}
        className="mx-(--sf-surface-pad) mb-3 h-39 md:col-start-1 md:row-span-2 md:row-start-1 md:m-0 md:size-52 md:h-32 md:self-start md:rounded-none"
        onOpenPhoto={(index, trigger) => onOpenMedia(option.child.id, index, trigger)}
      />
      <div className="flex flex-col gap-4 p-(--sf-surface-pad) pt-0 md:col-start-2 md:row-start-2 md:pt-2">
        <RoomDetails
          option={option}
          attributeSchema={attributeSchema}
          hidePhotos
          hideHeading
        />
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 border-t border-border pt-3">
          <PolicyList depositPercent={option.detail.depositPercent} compact />
          <div className="flex flex-col items-end gap-3">
            <GuestCapacityRules capacity={option.child.capacity} compact />
            <RoomPrice option={option} mode={mode} state={state} compact />
          </div>
        </div>
        <RoomAction
          option={option}
          groupSlug={groupSlug}
          mode={mode}
          date={date}
          state={state}
          slots={slots}
        />
      </div>
    </article>
  );
}
