import type { HourlySlot } from '@booking/contracts';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@booking/ui/components/ui/empty';
import { Building2 } from 'lucide-react';
import { useMemo } from 'react';
import { SectionCard } from '../../../components/section-card';
import { NsI18n, useTranslation } from '../../../lib/i18n';
import type { BookingMode, RoomOption } from '../listing-group-types';
import { atomicHourlySlots, roomAvailabilityState } from '../listing-group-utils';
import {
  CapacityDetails,
  PolicyList,
  RoomAction,
  RoomDetails,
  RoomPhotoStrip,
  RoomPrice,
} from './room-cells';

type SlotsByRoom = ReadonlyMap<string, HourlySlot[]>;

export function RoomOptionsSection({
  roomOptions,
  mode,
  date,
}: {
  roomOptions: RoomOption[];
  mode: BookingMode;
  date: string;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  // The table and the card list are both mounted at every width, so deriving
  // the atomic slots per room here keeps `atomicHourlySlots` off the render path.
  const slotsByRoom = useMemo<SlotsByRoom>(
    () => new Map(roomOptions.map((option) => [option.child.id, hourlySlotsOf(option)])),
    [roomOptions],
  );

  return (
    <SectionCard id="room-options" aria-labelledby="room-options-title" className="scroll-mt-28">
      <div className="mb-5">
        <h2 id="room-options-title" className="text-base font-semibold">
          {t('group.roomTypes')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === 'hourly' ? t('group.availabilityOn', { date }) : t('group.availabilityRange')}
        </p>
      </div>

      {roomOptions.length ? (
        <>
          <div className="hidden overflow-x-auto rounded-md border xl:block">
            <table className="w-full table-fixed text-left text-sm">
              <caption className="sr-only">{t('group.roomTableLabel')}</caption>
              <thead>
                <tr className="bg-muted/60 text-xs font-semibold">
                  <th scope="col" className="w-93.5 p-4">
                    {t('group.roomTypes')}
                  </th>
                  <th scope="col" className="w-70 border-l border-border p-4">
                    {t('group.colCapacity')}
                  </th>
                  <th scope="col" className="w-56 border-l border-border p-4">
                    {t('group.colPrice')}
                  </th>
                  <th scope="col" className="w-61 border-l border-border p-4">
                    {t('group.colChoice')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {roomOptions.map((option) => (
                  <RoomRow
                    key={option.child.id}
                    option={option}
                    mode={mode}
                    date={date}
                    slots={slotsByRoom.get(option.child.id) ?? []}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-4 xl:hidden">
            {roomOptions.map((option) => (
              <RoomCard
                key={option.child.id}
                option={option}
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
  mode: BookingMode;
  date: string;
  slots: HourlySlot[];
}

function RoomRow({ option, mode, date, slots }: RoomProps) {
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
        <RoomAction option={option} mode={mode} date={date} state={state} slots={slots} />
        <PolicyList depositPercent={option.detail.depositPercent} />
      </td>
    </tr>
  );
}

function RoomCard({ option, mode, date, slots }: RoomProps) {
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
        <RoomAction option={option} mode={mode} date={date} state={state} slots={slots} />
        <PolicyList depositPercent={option.detail.depositPercent} />
      </div>
    </article>
  );
}

function hourlySlotsOf(option: RoomOption): HourlySlot[] {
  if (option.availability?.mode !== 'hourly') return [];
  return atomicHourlySlots(
    option.availability.days.flatMap((day) => day.slots).filter((slot) => slot.available),
  );
}
