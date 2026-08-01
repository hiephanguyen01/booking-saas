import { z } from 'zod';
import {
  MAX_BOOKING_RANGE_DAYS,
  MAX_BULK_CALENDAR_DAYS,
  dateOnlyDistanceDays,
  dateOnlySchema,
  moneyStringSchema,
  timeOfDaySchema,
  uuidSchema,
} from './common';

const weekdaySchema = z.number().int().min(0).max(6); // 0=Sun … 6=Sat

// ── Availability rules (weekly opening hours, per listing — §7.4) ─────────────

export const availabilityRuleInputSchema = z
  .object({
    dayOfWeek: weekdaySchema,
    openTime: timeOfDaySchema,
    closeTime: timeOfDaySchema,
  })
  .refine((r) => r.openTime < r.closeTime, {
    path: ['closeTime'],
    message: 'closeTime must be after openTime',
  });
export type AvailabilityRuleInput = z.infer<typeof availabilityRuleInputSchema>;

/** Replace a listing's whole weekly rule set atomically. */
export const setAvailabilityRulesInputSchema = z.object({
  rules: z.array(availabilityRuleInputSchema).max(50),
});
export type SetAvailabilityRulesInput = z.infer<typeof setAvailabilityRulesInputSchema>;

// ── Availability exceptions (date-specific, per resource — §7.4) ──────────────

export const availabilityExceptionTypeSchema = z.enum(['closed', 'custom_hours']);
export type AvailabilityExceptionType = z.infer<typeof availabilityExceptionTypeSchema>;

/** One opening window, resource-local `HH:MM`. */
export const availabilityWindowSchema = z
  .object({ openTime: timeOfDaySchema, closeTime: timeOfDaySchema })
  .refine((w) => w.openTime < w.closeTime, {
    path: ['closeTime'],
    message: 'closeTime must be after openTime',
  });
export type AvailabilityWindow = z.infer<typeof availabilityWindowSchema>;

/** A day may not open twice over the same minute — that would double-generate slots. */
export function windowsOverlap(windows: readonly AvailabilityWindow[]): boolean {
  const sorted = [...windows].sort((a, b) => a.openTime.localeCompare(b.openTime));
  return sorted.some((window, index) => {
    const previous = sorted[index - 1];
    return previous !== undefined && window.openTime < previous.closeTime;
  });
}

/**
 * Shared `custom_hours` check for the single-date and range inputs: a custom day
 * needs windows, and they must not overlap. `windows` is the modern shape; the
 * bare `openTime`/`closeTime` pair is still accepted as the one-window form.
 */
function refineCustomHours(
  input: {
    type: AvailabilityExceptionType;
    windows?: AvailabilityWindow[];
    openTime?: string;
    closeTime?: string;
  },
  ctx: z.RefinementCtx,
): void {
  if (input.type !== 'custom_hours') return;
  if (input.windows && input.windows.length > 0) {
    if (windowsOverlap(input.windows)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['windows'],
        message: 'Windows must not overlap',
      });
    }
    return;
  }
  if (!input.openTime || !input.closeTime) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['windows'],
      message: 'custom_hours requires at least one window',
    });
  } else if (input.openTime >= input.closeTime) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['closeTime'],
      message: 'closeTime must be after openTime',
    });
  }
}

export const availabilityExceptionInputSchema = z
  .object({
    date: dateOnlySchema,
    type: availabilityExceptionTypeSchema,
    /** Preferred shape. Omit and send `openTime`/`closeTime` for a single window. */
    windows: z.array(availabilityWindowSchema).min(1).max(12).optional(),
    openTime: timeOfDaySchema.optional(),
    closeTime: timeOfDaySchema.optional(),
    reason: z.string().max(200).optional(),
  })
  .superRefine(refineCustomHours);
export type AvailabilityExceptionInput = z.infer<typeof availabilityExceptionInputSchema>;

/**
 * Apply one exception across a span of dates in a single write — the calendar's
 * "select a range" action. Same `custom_hours` rules as the single-date form;
 * each date in the span is upserted, so re-applying a range is idempotent.
 */
export const availabilityExceptionRangeInputSchema = z
  .object({
    from: dateOnlySchema,
    to: dateOnlySchema,
    type: availabilityExceptionTypeSchema,
    windows: z.array(availabilityWindowSchema).min(1).max(12).optional(),
    openTime: timeOfDaySchema.optional(),
    closeTime: timeOfDaySchema.optional(),
    reason: z.string().max(200).optional(),
  })
  .superRefine((input, ctx) => {
    refineCustomHours(input, ctx);
    const days = dateOnlyDistanceDays(input.from, input.to);
    if (days === null || days < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: 'to must be on/after from',
      });
    } else if (days + 1 > MAX_BULK_CALENDAR_DAYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: `Range must be at most ${MAX_BULK_CALENDAR_DAYS} days`,
      });
    }
  });
export type AvailabilityExceptionRangeInput = z.infer<typeof availabilityExceptionRangeInputSchema>;

/**
 * Quick calendar block (§14) — the dashboard `QuickBlockDialog` GenericForm body.
 * The partner picks a listing (`listingId`); the route maps it to the listing's
 * real resource id and POSTs a `{ date, type: 'closed', reason }` block via
 * `POST /partner/resources/:id/availability-exceptions`. `date` is a `Date` (the
 * calendar picker's value) that the route re-validates and formats to the VN
 * calendar day before sending.
 */
export const createBlockExceptionInputSchema = z.object({
  listingId: uuidSchema,
  date: z.coerce.date(),
  reason: z.string().max(200).optional(),
});
export type CreateBlockExceptionInput = z.infer<typeof createBlockExceptionInputSchema>;

// ── Public availability query (§9) ────────────────────────────────────────────

export const availabilityModeSchema = z.enum(['hourly', 'daily', 'inventory']);
export type AvailabilityMode = z.infer<typeof availabilityModeSchema>;

export const availabilityQuerySchema = z
  .object({
    mode: availabilityModeSchema,
    from: dateOnlySchema,
    to: dateOnlySchema,
    packageId: uuidSchema.optional(),
    view: z.enum(['detail', 'calendar']).default('detail'),
  })
  .superRefine((query, ctx) => {
    if (query.mode === 'inventory' && query.view === 'calendar') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['view'],
        message: 'Calendar view is not available for inventory mode',
      });
    }
    const distance = dateOnlyDistanceDays(query.from, query.to);
    if (distance === null || distance < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: 'to must be on/after from',
      });
      return;
    }
    // Availability ranges are inclusive, so distance 30 represents 31 days.
    if (distance >= MAX_BOOKING_RANGE_DAYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: `Range must be at most ${MAX_BOOKING_RANGE_DAYS} days`,
      });
    }
  });
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

// ── Responses ────────────────────────────────────────────────────────────────

export const availabilityRuleResponseSchema = z.object({
  id: z.string(),
  listingId: z.string(),
  dayOfWeek: z.number(),
  openTime: timeOfDaySchema,
  closeTime: timeOfDaySchema,
});
export type AvailabilityRuleResponse = z.infer<typeof availabilityRuleResponseSchema>;

export const availabilityExceptionResponseSchema = z.object({
  id: z.string(),
  resourceId: z.string(),
  date: dateOnlySchema,
  type: availabilityExceptionTypeSchema,
  /**
   * Every opening window of the day; empty when the day is `closed`. Always
   * present, so a reader never has to branch on the legacy pair below.
   */
  windows: z.array(availabilityWindowSchema),
  /** Compatibility mirror of `windows[0]`. Read `windows` instead. */
  openTime: timeOfDaySchema.nullable(),
  /** Compatibility mirror of `windows[0]`. Read `windows` instead. */
  closeTime: timeOfDaySchema.nullable(),
  reason: z.string().nullable(),
});
export type AvailabilityExceptionResponse = z.infer<typeof availabilityExceptionResponseSchema>;

/** One bookable start for hourly mode; `price` is the VND đồng cost of a min-duration booking. */
export const hourlySlotSchema = z.object({
  startUtc: z.string(),
  endUtc: z.string(),
  available: z.boolean(),
  price: moneyStringSchema,
  /**
   * Price before a live sale campaign; equals `price` when nothing discounts
   * this slot. Always present, so "this hour is on sale" is a comparison rather
   * than a guess — without it a discounted slot and a cheap one look identical.
   */
  regularPrice: moneyStringSchema,
  /** Named campaign that discounted this slot, when there is one. */
  campaignLabel: z.string().optional(),
});
export type HourlySlot = z.infer<typeof hourlySlotSchema>;

export const dayStatusSchema = z.enum(['available', 'booked', 'blocked', 'closed']);
export type DayStatus = z.infer<typeof dayStatusSchema>;

export const dayAvailabilitySchema = z.object({
  date: dateOnlySchema,
  status: dayStatusSchema,
  /** Night price (VND đồng); null when closed/blocked. */
  price: moneyStringSchema.nullable(),
  /** Night price before a live sale; equals `price` when nothing discounts the day. */
  regularPrice: moneyStringSchema.nullable(),
  /** Named campaign that discounted this day, when there is one. */
  campaignLabel: z.string().optional(),
});
export type DayAvailability = z.infer<typeof dayAvailabilitySchema>;

export const hourlyDaySchema = z.object({
  date: dateOnlySchema,
  slots: z.array(hourlySlotSchema),
});
export type HourlyDay = z.infer<typeof hourlyDaySchema>;

/** Remaining stock for an inventory listing over the queried window (§9.4). */
export const inventoryAvailabilitySchema = z.object({
  stock: z.number(),
  remaining: z.number(),
});
export type InventoryAvailability = z.infer<typeof inventoryAvailabilitySchema>;

export const availabilityResponseSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('hourly'), timezone: z.string(), days: z.array(hourlyDaySchema) }),
  z.object({
    mode: z.literal('daily'),
    timezone: z.string(),
    days: z.array(dayAvailabilitySchema),
  }),
  z.object({
    mode: z.literal('inventory'),
    timezone: z.string(),
    inventory: inventoryAvailabilitySchema,
  }),
]);
export type AvailabilityResponse = z.infer<typeof availabilityResponseSchema>;

export const availabilityCalendarStatusSchema = z.enum([
  'available',
  'sold_out',
  'closed',
  'blocked',
]);
export type AvailabilityCalendarStatus = z.infer<typeof availabilityCalendarStatusSchema>;

export const availabilityCalendarSaleSchema = z.object({
  coverage: z.enum(['full', 'partial']),
  minDiscountPercent: z.number().int().min(1).max(100),
  maxDiscountPercent: z.number().int().min(1).max(100),
  campaignLabels: z.array(z.string()),
});
export type AvailabilityCalendarSale = z.infer<typeof availabilityCalendarSaleSchema>;

export const availabilityCalendarResponseSchema = z.object({
  view: z.literal('calendar'),
  mode: z.enum(['hourly', 'daily']),
  timezone: z.string(),
  days: z.array(
    z.object({
      date: dateOnlySchema,
      status: availabilityCalendarStatusSchema,
      sale: availabilityCalendarSaleSchema.nullable(),
    }),
  ),
});
export type AvailabilityCalendarResponse = z.infer<typeof availabilityCalendarResponseSchema>;
export type AvailabilityCalendarDay = AvailabilityCalendarResponse['days'][number];

export const availabilityEndpointResponseSchema = z.union([
  availabilityResponseSchema,
  availabilityCalendarResponseSchema,
]);
export type AvailabilityEndpointResponse = z.infer<typeof availabilityEndpointResponseSchema>;
