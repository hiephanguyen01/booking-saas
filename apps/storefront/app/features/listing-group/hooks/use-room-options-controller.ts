import type { HourlySlot } from '@booking/contracts';
import { useMemo, useState } from 'react';
import type { RoomOption } from '~/features/listing-group/lib/listing-group-types';
import { atomicHourlySlots } from '~/features/booking-widget/lib/slot-selection';

type SlotsByRoom = ReadonlyMap<string, HourlySlot[]>;

export function useRoomOptionsController({
  hideUnavailableByDefault,
  roomOptions,
}: {
  hideUnavailableByDefault: boolean;
  roomOptions: RoomOption[];
}) {
  const [hideUnavailable, setHideUnavailable] = useState(hideUnavailableByDefault);
  const slotsByRoom = useMemo<SlotsByRoom>(
    () => new Map(roomOptions.map((option) => [option.child.id, hourlySlotsOf(option)])),
    [roomOptions],
  );
  const browsing = roomOptions.some((option) => option.browsing);
  const unavailableCount = roomOptions.filter(
    (option) => !option.browsing && option.available === false,
  ).length;
  const visibleOptions = hideUnavailable
    ? roomOptions.filter((option) => option.browsing || option.available)
    : roomOptions;

  return {
    browsing,
    hideUnavailable,
    slotsByRoom,
    toggleHideUnavailable: () => setHideUnavailable((current) => !current),
    unavailableCount,
    visibleOptions,
  };
}

function hourlySlotsOf(option: RoomOption): HourlySlot[] {
  if (option.availability?.mode !== 'hourly') return [];
  return atomicHourlySlots(option.availability.days.flatMap((day) => day.slots));
}
