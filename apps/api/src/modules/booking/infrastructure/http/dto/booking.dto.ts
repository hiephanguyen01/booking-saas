import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  bookingOtpResponseSchema,
  bookingResponseSchema,
  bookingStatusSchema,
  cancelBookingInputSchema,
  cancelBookingResponseSchema,
  createBookingInputSchema,
  markReturnedInputSchema,
  partnerCalendarBookingResponseSchema,
  reasonInputSchema,
  returnBookingResponseSchema,
  uuidSchema,
} from '@booking/contracts';

// ── Request bodies ───────────────────────────────────────────────────────────
export class CreateBookingDto extends createZodDto(createBookingInputSchema) {}
export class CancelBookingDto extends createZodDto(cancelBookingInputSchema) {}
export class ReasonDto extends createZodDto(reasonInputSchema) {}
export class MarkReturnedDto extends createZodDto(markReturnedInputSchema) {}

// ── Queries ──────────────────────────────────────────────────────────────────

/** Window query for the partner master-calendar feed — UTC ISO instants, max 62 days. */
const calendarRangeSchema = z
  .object({
    from: z.string().datetime(),
    to: z.string().datetime(),
  })
  .refine((q) => Date.parse(q.from) < Date.parse(q.to), {
    path: ['to'],
    message: 'to must be after from',
  })
  .refine((q) => Date.parse(q.to) - Date.parse(q.from) <= 62 * 86_400_000, {
    path: ['to'],
    message: 'Range must be at most 62 days',
  });
export class CalendarRangeQueryDto extends createZodDto(calendarRangeSchema) {}

/** Query filters for the tenant booking overview (Task 1.13). */
const tenantBookingsQuerySchema = z.object({
  status: bookingStatusSchema.optional(),
  partnerId: uuidSchema.optional(),
});
export class TenantBookingsQueryDto extends createZodDto(tenantBookingsQuerySchema) {}

// ── Responses ────────────────────────────────────────────────────────────────
export class BookingResponseDto extends createZodDto(bookingResponseSchema) {}
export class CancelBookingResponseDto extends createZodDto(cancelBookingResponseSchema) {}
export class ReturnBookingResponseDto extends createZodDto(returnBookingResponseSchema) {}
export class BookingOtpResponseDto extends createZodDto(bookingOtpResponseSchema) {}
export class PartnerCalendarBookingResponseDto extends createZodDto(
  partnerCalendarBookingResponseSchema,
) {}

/** Partner booking health for the tenant dashboard — counts plus derived rates. */
const partnerBookingStatsResponseSchema = z.object({
  partnerId: z.string(),
  total: z.number(),
  cancelled: z.number(),
  noShow: z.number(),
  completed: z.number(),
  confirmed: z.number(),
  /** 0–1 fractions; 0 when the partner has no bookings yet. */
  cancellationRate: z.number(),
  noShowRate: z.number(),
});
export class PartnerBookingStatsResponseDto extends createZodDto(
  partnerBookingStatsResponseSchema,
) {}
