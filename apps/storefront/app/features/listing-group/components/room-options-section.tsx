import type { HourlySlot } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@booking/ui/components/ui/empty';
import { Building2 } from 'lucide-react';
import { SectionCard } from '../../../components/section-card';
import { NsI18n, useTranslation } from '../../../lib/i18n';
import type { BookingMode, RoomOption } from '../listing-group-types';
import { roomAvailabilityState } from '../listing-group-utils';
import { CapacityDetails, PolicyList, RoomAction, RoomDetails, RoomPrice } from './room-cells';
import { RoomPhotoStrip } from './room-photo-strip';
import { useRoomOptionsController } from './use-room-options-controller';

export function RoomOptionsSection({
  roomOptions,
  groupSlug,
  mode,
  date,
  hideUnavailableByDefault,
}: {
  roomOptions: RoomOption[];
  groupSlug: string;
  mode: BookingMode;
  date: string;
  hideUnavailableByDefault: boolean;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const {
    browsing,
    hideUnavailable,
    slotsByRoom,
    toggleHideUnavailable,
    unavailableCount,
    visibleOptions,
  } = useRoomOptionsController({ hideUnavailableByDefault, roomOptions });

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
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={toggleHideUnavailable}
          >
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
                    groupSlug={groupSlug}
                    mode={mode}
                    date={date}
                    slots={slotsByRoom.get(option.child.id) ?? []}
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
                groupSlug={groupSlug}
                mode={mode}
                date={date}
                slots={slotsByRoom.get(option.child.id) ?? []}
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
    </SectionCard>
  );
}

interface RoomProps {
  option: RoomOption;
  groupSlug: string;
  mode: BookingMode;
  date: string;
  slots: HourlySlot[];
}

function RoomRow({ option, groupSlug, mode, date, slots }: RoomProps) {
  const state = roomAvailabilityState(option);
  return (
    <tr className="border-t border-border align-top">
      <td className="min-w-0 p-5">
        <RoomDetails option={option} />
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

function RoomCard({ option, groupSlug, mode, date, slots }: RoomProps) {
  const state = roomAvailabilityState(option);
  return (
    <article className="overflow-hidden rounded-lg border border-border bg-card">
      <RoomPhotoStrip photos={option.child.photos} title={option.child.title} />
      <div className="flex flex-col gap-5 p-5">
        <RoomDetails option={option} hidePhotos />
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
