import type { AvailabilityRuleResponse } from '@booking/contracts';

/**
 * Weekly opening-hours editing (§7.4). A listing may store SEVERAL availability
 * rules for the same weekday — a split shift like 08:00–12:00 + 14:00–18:00 is
 * two rules, and the API replaces the whole rule set on PUT.
 *
 * This editor therefore models N windows per weekday. It previously seeded each
 * weekday from `rules.find(...)` — the FIRST matching rule — and PUT one rule per
 * day back, so opening the page and pressing save PERMANENTLY DELETED every
 * additional window. Pure + React-free so the seed/serialize round-trip is
 * unit-testable.
 */

/** Display order Mon…Sun; `dow` is the backend's 0=Sun…6=Sat value. */
export const DAYS: { dow: number; label: string }[] = [
  { dow: 1, label: 'Thứ 2' },
  { dow: 2, label: 'Thứ 3' },
  { dow: 3, label: 'Thứ 4' },
  { dow: 4, label: 'Thứ 5' },
  { dow: 5, label: 'Thứ 6' },
  { dow: 6, label: 'Thứ 7' },
  { dow: 0, label: 'Chủ nhật' },
];

export const DEFAULT_OPEN = '08:00';
export const DEFAULT_CLOSE = '20:00';

/** The API caps a listing at 50 rules (`setAvailabilityRulesInputSchema`). */
export const MAX_WINDOWS = 50;

export interface HoursWindow {
  open: string;
  close: string;
}

/** Every weekday → its windows, in open-time order. A day with none is closed. */
export type WeekWindows = Record<number, HoursWindow[]>;

/**
 * Seed the editor from the listing's saved rules, keeping EVERY window of every
 * weekday (the bug this replaces kept only the first).
 */
export function seedWeek(rules: readonly AvailabilityRuleResponse[]): WeekWindows {
  const week: WeekWindows = {};
  for (const { dow } of DAYS) week[dow] = [];
  for (const rule of rules) {
    week[rule.dayOfWeek]?.push({ open: rule.openTime, close: rule.closeTime });
  }
  for (const { dow } of DAYS) week[dow]!.sort((a, b) => a.open.localeCompare(b.open));
  return week;
}

/** Flatten the editor back into the rule set to PUT, in display order. */
export function toRules(week: WeekWindows): { dayOfWeek: number; openTime: string; closeTime: string }[] {
  return DAYS.flatMap(({ dow }) =>
    (week[dow] ?? []).map((w) => ({ dayOfWeek: dow, openTime: w.open, closeTime: w.close })),
  );
}

/**
 * The wire form of one window: `dow|open|close`. A repeated hidden field (rather
 * than indexed names) keeps add/remove from having to renumber anything.
 */
export const WINDOW_FIELD = 'window';

export function encodeWindow(dow: number, w: HoursWindow): string {
  return `${dow}|${w.open}|${w.close}`;
}

/** Parse the submitted `window` fields back into rule inputs; junk rows are dropped. */
export function decodeWindows(
  values: readonly string[],
): { dayOfWeek: number; openTime: string; closeTime: string }[] {
  return values.flatMap((value) => {
    const [rawDow, openTime, closeTime] = value.split('|');
    const dayOfWeek = Number(rawDow);
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) return [];
    if (!openTime || !closeTime) return [];
    return [{ dayOfWeek, openTime, closeTime }];
  });
}

/** A window is well-formed when it closes after it opens. */
export function isValidWindow(w: HoursWindow): boolean {
  return w.open < w.close;
}

/**
 * Indices of windows that overlap another window on the same day. Two rules on
 * one weekday are legitimate (a split shift), but overlapping ones are not: they
 * would double-generate the same slots.
 */
export function overlappingIndices(windows: readonly HoursWindow[]): Set<number> {
  const clashes = new Set<number>();
  for (let i = 0; i < windows.length; i++) {
    for (let j = i + 1; j < windows.length; j++) {
      const a = windows[i]!;
      const b = windows[j]!;
      if (a.open < b.close && b.open < a.close) {
        clashes.add(i);
        clashes.add(j);
      }
    }
  }
  return clashes;
}

/** Every problem that must block a save, as user-facing Vietnamese copy. */
export function validateWeek(week: WeekWindows): string[] {
  const errors: string[] = [];
  for (const { dow, label } of DAYS) {
    const windows = week[dow] ?? [];
    if (windows.some((w) => !isValidWindow(w))) {
      errors.push(`${label}: giờ đóng phải sau giờ mở.`);
    }
    if (overlappingIndices(windows).size > 0) {
      errors.push(`${label}: các khung giờ bị trùng nhau.`);
    }
  }
  if (toRules(week).length > MAX_WINDOWS) {
    errors.push(`Tối đa ${MAX_WINDOWS} khung giờ cho mỗi tin đăng.`);
  }
  return errors;
}
