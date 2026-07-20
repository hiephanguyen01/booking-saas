import { z } from 'zod';
import { uuidSchema } from './common';

// Local primitives (mirror the ones in contracts/listing.ts).
const timeStringSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:MM (24h)');
const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be an ISO date (YYYY-MM-DD)');
const weekdaySchema = z.number().int().min(0).max(6); // 0=Sun … 6=Sat

// ── Availability rules (weekly opening hours, per listing — §7.4) ─────────────

export const availabilityRuleInputSchema = z
  .object({
    dayOfWeek: weekdaySchema,
    openTime: timeStringSchema,
    closeTime: timeStringSchema,
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
    date: dateStringSchema,
    type: availabilityExceptionTypeSchema,
    openTime: timeStringSchema.optional(),
    closeTime: timeStringSchema.optional(),
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
    from: dateStringSchema,
    to: dateStringSchema,
    packageId: uuidSchema.optional(),
  })
  .refine((q) => q.from <= q.to, { path: ['to'], message: 'to must be on/after from' })
  .refine((q) => spanDays(q.from, q.to) <= 31, {
    path: ['to'],
    message: 'Range must be at most 31 days',
  });
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

function spanDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

// ── Responses ────────────────────────────────────────────────────────────────

export const availabilityRuleResponseSchema = z.object({
  id: z.string(),
  listingId: z.string(),
  dayOfWeek: z.number(),
  openTime: z.string(),
  closeTime: z.string(),
});
export type AvailabilityRuleResponse = z.infer<typeof availabilityRuleResponseSchema>;

export const availabilityExceptionResponseSchema = z.object({
  id: z.string(),
  resourceId: z.string(),
  date: z.string(),
  type: availabilityExceptionTypeSchema,
  openTime: z.string().nullable(),
  closeTime: z.string().nullable(),
  reason: z.string().nullable(),
});
export type AvailabilityExceptionResponse = z.infer<typeof availabilityExceptionResponseSchema>;

/** One bookable start for hourly mode; `price` is the VND đồng cost of a min-duration booking. */
export const hourlySlotSchema = z.object({
  startUtc: z.string(),
  endUtc: z.string(),
  available: z.boolean(),
  price: z.string(),
});
export type HourlySlot = z.infer<typeof hourlySlotSchema>;

export const dayStatusSchema = z.enum(['available', 'booked', 'blocked', 'closed']);
export type DayStatus = z.infer<typeof dayStatusSchema>;

export const dayAvailabilitySchema = z.object({
  date: z.string(),
  status: dayStatusSchema,
  /** Night price (VND đồng); null when closed/blocked. */
  price: z.string().nullable(),
});
export type DayAvailability = z.infer<typeof dayAvailabilitySchema>;

export const hourlyDaySchema = z.object({
  date: z.string(),
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
