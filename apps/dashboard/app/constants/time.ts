// Time constants shared across areas. Client-safe, no framework imports.
// (Formatting FUNCTIONS live in ~/lib/format — this file is data only.)

/** VN market timezone — every calendar bucket and clock renders in this zone. */
export const TZ = 'Asia/Ho_Chi_Minh';

/** Fixed VN UTC offset (no DST) — for building local-day ISO bounds. */
export const TZ_OFFSET = '+07:00';

/** Vietnamese weekday abbreviations, Sunday-first (index = JS `getDay()` / dow 0–6). */
export const WEEKDAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;
