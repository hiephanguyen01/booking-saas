import type { BookingMode, ModeConfig } from '@booking/contracts';
import { wallClockInZone } from '../../../shared/time/time';
import type { BookingSchedule } from './ports/booking-availability-reader.port';

export interface SlotPolicyInput {
  mode: BookingMode;
  modeConfig: ModeConfig;
  timezone: string;
  startUtc: Date;
  endUtc: Date;
  now: Date;
  schedule: BookingSchedule;
}

const pad = (value: number) => String(value).padStart(2, '0');
const dateKey = (wall: ReturnType<typeof wallClockInZone>) =>
  `${wall.year}-${pad(wall.month)}-${pad(wall.day)}`;
const minutes = (value: string) => {
  const [hour = 0, minute = 0] = value.split(':').map(Number);
  return hour * 60 + minute;
};

function nextDate(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

function openOnDate(
  schedule: BookingSchedule,
  date: string,
  weekday: number,
  daily: boolean,
): boolean {
  const exception = schedule.exceptions.find((item) => item.date === date);
  if (exception?.type === 'closed') return false;
  if (exception?.type === 'custom_hours') return true;
  return daily && schedule.weekly.length === 0
    ? true
    : schedule.weekly.some((item) => item.dayOfWeek === weekday);
}

/** Pure guard used before a booking is inserted; returns a stable API error code. */
export function validateSlotPolicy(input: SlotPolicyInput): string | null {
  if (input.mode === 'inventory') return null;
  const startWall = wallClockInZone(input.startUtc, input.timezone);
  const endWall = wallClockInZone(input.endUtc, input.timezone);

  if (input.mode === 'hourly') {
    const config = input.modeConfig.hourly;
    if (!config) return 'MODE_CONFIG_MISSING';
    const durationMinutes = (input.endUtc.getTime() - input.startUtc.getTime()) / 60_000;
    if (
      durationMinutes < config.minDuration * 60 ||
      durationMinutes > config.maxDuration * 60 ||
      durationMinutes % config.granularity !== 0
    )
      return 'INVALID_DURATION';
    if (input.startUtc.getTime() < input.now.getTime() + config.leadTimeMin * 60_000)
      return 'LEAD_TIME_REQUIRED';
    const date = dateKey(startWall);
    if (
      date !== dateKey(endWall) &&
      !(endWall.hour === 0 && endWall.minute === 0 && dateKey(endWall) === nextDate(date))
    ) {
      return 'OUTSIDE_OPEN_HOURS';
    }
    const exception = input.schedule.exceptions.find((item) => item.date === date);
    if (exception?.type === 'closed') return 'DATE_CLOSED';
    const windows =
      exception?.type === 'custom_hours'
        ? [{ openTime: exception.openTime, closeTime: exception.closeTime }]
        : input.schedule.weekly.filter((item) => item.dayOfWeek === startWall.weekday);
    const startMinute = startWall.hour * 60 + startWall.minute;
    const endMinute = dateKey(endWall) === date ? endWall.hour * 60 + endWall.minute : 24 * 60;
    const contained = windows.some(
      (window) =>
        window.openTime &&
        window.closeTime &&
        startMinute >= minutes(window.openTime) &&
        endMinute <= minutes(window.closeTime),
    );
    return contained ? null : 'OUTSIDE_OPEN_HOURS';
  }

  const config = input.modeConfig.daily;
  if (!config) return 'MODE_CONFIG_MISSING';
  const from = dateKey(startWall);
  const to = dateKey(endWall);
  const dates: string[] = [];
  for (let cursor = from; cursor < to; cursor = nextDate(cursor)) dates.push(cursor);
  if (dates.length < config.minNights || dates.length > config.maxNights) return 'INVALID_DURATION';
  if (input.startUtc.getTime() < input.now.getTime() + config.leadTimeMin * 60_000)
    return 'LEAD_TIME_REQUIRED';
  const closed = dates.some((date) => {
    const wall = wallClockInZone(new Date(`${date}T12:00:00Z`), input.timezone);
    return !openOnDate(input.schedule, date, wall.weekday, true);
  });
  return closed ? 'DATE_CLOSED' : null;
}
