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

export const availabilityExceptionInputSchema = z
  .object({
    date: dateOnlySchema,
    type: availabilityExceptionTypeSchema,
    openTime: timeOfDaySchema.optional(),
    closeTime: timeOfDaySchema.optional(),
    reason: z.string().max(200).optional(),
  })
  .superRefine((e, ctx) => {
    if (e.type === 'custom_hours') {
      if (!e.openTime || !e.closeTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['openTime'],
          message: 'custom_hours requires openTime and closeTime',
        });
      } else if (e.openTime >= e.closeTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['closeTime'],
          message: 'closeTime must be after openTime',
        });
      }
    }
  });
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
    openTime: timeOfDaySchema.optional(),
    closeTime: timeOfDaySchema.optional(),
    reason: z.string().max(200).optional(),
  })
  .superRefine((input, ctx) => {
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
    if (input.type === 'custom_hours') {
      if (!input.openTime || !input.closeTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['openTime'],
          message: 'custom_hours requires openTime and closeTime',
        });
      } else if (input.openTime >= input.closeTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['closeTime'],
          message: 'closeTime must be after openTime',
        });
      }
    }
  });
export type AvailabilityExceptionRangeInput = z.infer<
  typeof availabilityExceptionRangeInputSchema
>;

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
  })
  .superRefine((query, ctx) => {
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
  openTime: timeOfDaySchema.nullable(),
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
});
export type HourlySlot = z.infer<typeof hourlySlotSchema>;

export const dayStatusSchema = z.enum(['available', 'booked', 'blocked', 'closed']);
export type DayStatus = z.infer<typeof dayStatusSchema>;

export const dayAvailabilitySchema = z.object({
  date: dateOnlySchema,
  status: dayStatusSchema,
  /** Night price (VND đồng); null when closed/blocked. */
  price: moneyStringSchema.nullable(),
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
  z.object({ mode: z.literal('daily'), timezone: z.string(), days: z.array(dayAvailabilitySchema) }),
  z.object({
    mode: z.literal('inventory'),
    timezone: z.string(),
    inventory: inventoryAvailabilitySchema,
  }),
]);
export type AvailabilityResponse = z.infer<typeof availabilityResponseSchema>;
