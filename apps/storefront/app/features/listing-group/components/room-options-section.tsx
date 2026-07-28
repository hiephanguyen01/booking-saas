import type { AttributeField, HourlySlot } from '@booking/contracts';
import { type MediaViewerItem } from '@booking/ui/components/media/media-viewer-dialog';
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
import { useRef, useState } from 'react';
import { SectionCard } from '~/components/section-card';
import { NsI18n, useTranslation } from '~/lib/i18n';
import { useMediaViewerLabels } from '~/hooks/use-media-viewer-labels';
import type { BookingMode, RoomOption } from '~/features/listing-group/lib/listing-group-types';
import { roomAvailabilityState } from '~/features/listing-group/lib/listing-group-utils';
import { CapacityDetails, PolicyList, RoomAction, RoomDetails, RoomPrice } from './room-cells';
import { RoomMediaDetails } from './room-media-details';
import { RoomPhotoStrip } from './room-photo-strip';
import { useRoomOptionsController } from '~/features/listing-group/hooks/use-room-options-controller';

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
  const [activeMedia, setActiveMedia] = useState<{ roomId: string; index: number } | null>(null);
  const mediaTriggerRef = useRef<HTMLButtonElement | null>(null);
  const {
    browsing,
    hideUnavailable,
    slotsByRoom,
    toggleHideUnavailable,
    unavailableCount,
    visibleOptions,
  } = useRoomOptionsController({ hideUnavailableByDefault, roomOptions });
  const activeRoom = activeMedia
    ? (visibleOptions.find((option) => option.child.id === activeMedia.roomId) ?? null)
    : null;
  const mediaItems: MediaViewerItem[] =
    activeRoom?.child.photos.map((photo, index) => ({
      kind: 'image',
      url: photo,
      alt: t('group.photoAlt', { title: activeRoom.child.title, index: index + 1 }),
    })) ?? [];

  function openRoomMedia(roomId: string, index: number, trigger: HTMLButtonElement): void {
    mediaTriggerRef.current = trigger;
    setActiveMedia({ roomId, index });
  }

  return (
    <SectionCard id="room-options" aria-labelledby="room-options-title" className="scroll-mt-28">
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
                  <RoomRow
                    key={option.child.id}
                    option={option}
                    attributeSchema={attributeSchema}
                    groupSlug={groupSlug}
                    mode={mode}
                    date={date}
                    slots={slotsByRoom.get(option.child.id) ?? []}
                    onOpenMedia={openRoomMedia}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-4 xl:hidden">
            {visibleOptions.map((option) => (
              <RoomCard
                key={option.child.id}
                option={option}
                attributeSchema={attributeSchema}
                groupSlug={groupSlug}
                mode={mode}
                date={date}
                slots={slotsByRoom.get(option.child.id) ?? []}
                onOpenMedia={openRoomMedia}
              />
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
        open={Boolean(activeRoom)}
        items={mediaItems}
        activeIndex={activeMedia?.index ?? 0}
        onOpenChange={(open) => {
          if (!open) setActiveMedia(null);
        }}
        onActiveIndexChange={(index) => {
          setActiveMedia((current) => (current ? { ...current, index } : current));
        }}
        labels={viewerLabels}
        title={activeRoom?.child.title ?? t('group.roomTypes')}
        returnFocusRef={mediaTriggerRef}
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
        <CapacityDetails option={option} />
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
    <article className="overflow-hidden rounded-lg border border-border bg-card">
      <RoomPhotoStrip
        photos={option.child.photos}
        title={option.child.title}
        onOpenPhoto={(index, trigger) => onOpenMedia(option.child.id, index, trigger)}
      />
      <div className="flex flex-col gap-5 p-5">
        <RoomDetails option={option} attributeSchema={attributeSchema} hidePhotos />
        <div className="grid gap-4 sm:grid-cols-2">
          <CapacityDetails option={option} />
          <RoomPrice option={option} mode={mode} state={state} />
        </div>
        <RoomAction
          option={option}
          groupSlug={groupSlug}
          mode={mode}
          date={date}
          state={state}
          slots={slots}
        />
        <PolicyList depositPercent={option.detail.depositPercent} />
      </div>
    </article>
  );
}
