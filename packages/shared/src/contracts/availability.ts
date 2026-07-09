import { z } from 'zod';

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

// ── Public availability query (§9) ────────────────────────────────────────────

export const availabilityModeSchema = z.enum(['hourly', 'daily', 'inventory']);
export type AvailabilityMode = z.infer<typeof availabilityModeSchema>;

export const availabilityQuerySchema = z
  .object({
    mode: availabilityModeSchema,
    from: dateStringSchema,
    to: dateStringSchema,
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

export interface AvailabilityRuleResponse {
  id: string;
  listingId: string;
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
}

export interface AvailabilityExceptionResponse {
  id: string;
  resourceId: string;
  date: string;
  type: AvailabilityExceptionType;
  openTime: string | null;
  closeTime: string | null;
  reason: string | null;
}

/** One bookable start for hourly mode; `price` is the VND đồng cost of a min-duration booking. */
export interface HourlySlot {
  startUtc: string;
  endUtc: string;
  available: boolean;
  price: string;
}

export type DayStatus = 'available' | 'booked' | 'blocked' | 'closed';

export interface DayAvailability {
  date: string;
  status: DayStatus;
  /** Night price (VND đồng); null when closed/blocked. */
  price: string | null;
}

export interface HourlyDay {
  date: string;
  slots: HourlySlot[];
}

/** Remaining stock for an inventory listing over the queried window (§9.4). */
export interface InventoryAvailability {
  stock: number;
  remaining: number;
}

export type AvailabilityResponse =
  | { mode: 'hourly'; timezone: string; days: HourlyDay[] }
  | { mode: 'daily'; timezone: string; days: DayAvailability[] }
  | { mode: 'inventory'; timezone: string; inventory: InventoryAvailability };
