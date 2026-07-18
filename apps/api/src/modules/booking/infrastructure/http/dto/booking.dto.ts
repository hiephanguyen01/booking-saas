import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  bookingOtpResponseSchema,
  bookingResponseSchema,
  bookingStatusHistoryResponseSchema,
  cancelBookingInputSchema,
  cancelBookingResponseSchema,
  completeBookingInputSchema,
  createBookingInputSchema,
  markReturnedInputSchema,
  partnerBookingResponseSchema,
  partnerBookingStatsResponseSchema,
  partnerCalendarBookingResponseSchema,
  partnerCancelBookingResponseSchema,
  partnerNoteInputSchema,
  reasonInputSchema,
  returnBookingResponseSchema,
  tenantBookingResponseSchema,
  tenantBookingsQuerySchema,
} from '@booking/contracts';

// ── Request bodies ───────────────────────────────────────────────────────────
export class CreateBookingDto extends createZodDto(createBookingInputSchema) {}
export class CancelBookingDto extends createZodDto(cancelBookingInputSchema) {}
export class ReasonDto extends createZodDto(reasonInputSchema) {}
export class MarkReturnedDto extends createZodDto(markReturnedInputSchema) {}
export class CompleteBookingDto extends createZodDto(completeBookingInputSchema) {}
export class PartnerNoteDto extends createZodDto(partnerNoteInputSchema) {}

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

/** Query filters for the tenant booking overview (Task 1.13) — shared FE↔BE contract. */
export class TenantBookingsQueryDto extends createZodDto(tenantBookingsQuerySchema) {}

// ── Responses ────────────────────────────────────────────────────────────────
/** Customer audience (`/public/*`) — no partner note, no commission snapshot. */
export class BookingResponseDto extends createZodDto(bookingResponseSchema) {}
/** Tenant audience — the customer shape plus the tenant's internal detail. */
export class TenantBookingResponseDto extends createZodDto(tenantBookingResponseSchema) {}
/** Partner audience — masked customer, no email (§7.3). */
export class PartnerBookingResponseDto extends createZodDto(partnerBookingResponseSchema) {}
export class CancelBookingResponseDto extends createZodDto(cancelBookingResponseSchema) {}
export class PartnerCancelBookingResponseDto extends createZodDto(
  partnerCancelBookingResponseSchema,
) {}
export class ReturnBookingResponseDto extends createZodDto(returnBookingResponseSchema) {}
export class BookingOtpResponseDto extends createZodDto(bookingOtpResponseSchema) {}
export class BookingStatusHistoryResponseDto extends createZodDto(
  bookingStatusHistoryResponseSchema,
) {}
export class PartnerCalendarBookingResponseDto extends createZodDto(
  partnerCalendarBookingResponseSchema,
) {}

export class PartnerBookingStatsResponseDto extends createZodDto(
  partnerBookingStatsResponseSchema,
) {}
