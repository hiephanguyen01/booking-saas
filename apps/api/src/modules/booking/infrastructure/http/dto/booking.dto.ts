import {
  bookingAccessResponseSchema,
  bookingOtpResponseSchema,
  bookingResponseSchema,
  bookingStatusHistoryResponseSchema,
  cancelBookingInputSchema,
  cancelBookingResponseSchema,
  completeBookingInputSchema,
  createBookingInputSchema,
  createBookingResponseSchema,
  listPartnerBookingsQuerySchema,
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
  verifyBookingAccessInputSchema,
} from '@booking/contracts';
import { createZodDto } from 'nestjs-zod';

// ── Request bodies ───────────────────────────────────────────────────────────
export class CreateBookingDto extends createZodDto(createBookingInputSchema) {}
export class VerifyBookingAccessDto extends createZodDto(verifyBookingAccessInputSchema) {}
export class CancelBookingDto extends createZodDto(cancelBookingInputSchema) {}
export class ReasonDto extends createZodDto(reasonInputSchema) {}
export class MarkReturnedDto extends createZodDto(markReturnedInputSchema) {}
export class CompleteBookingDto extends createZodDto(completeBookingInputSchema) {}
export class PartnerNoteDto extends createZodDto(partnerNoteInputSchema) {}

// ── Queries ──────────────────────────────────────────────────────────────────

/** Filters for the partner master-calendar feed (search / status / optional timeslot window). */
export class ListPartnerBookingsQueryDto extends createZodDto(listPartnerBookingsQuerySchema) {}

/** Query filters for the tenant booking overview (Task 1.13) — shared FE↔BE contract. */
export class TenantBookingsQueryDto extends createZodDto(tenantBookingsQuerySchema) {}

// ── Responses ────────────────────────────────────────────────────────────────
/** Customer audience (`/public/*`) — no partner note, no commission snapshot. */
export class BookingResponseDto extends createZodDto(bookingResponseSchema) {}
export class CreateBookingResponseDto extends createZodDto(createBookingResponseSchema) {}
export class BookingAccessResponseDto extends createZodDto(bookingAccessResponseSchema) {}
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
