import type { NotificationTemplateId } from '../notification-plan';

/**
 * The idempotency identity of one notification delivery (§17). Value object — the
 * three key shapes used to be string templates copy-pasted across six use-cases.
 *
 * ⚠️ These formats are PERSISTED DATA: every already-sent row carries its key in
 * `notification_logs.payload->>'dedupeKey'`, and `alreadySent` matches on it. Changing
 * a single character makes historical rows invisible and an at-least-once outbox
 * redelivery re-sends a real email. Never "tidy" these strings.
 */
export class DedupeKey {
  private constructor(readonly value: string) {}

  /** Outbox-driven events: booking.* / listing.* / partner.* / payout.paid. */
  static forEvent(
    eventType: string,
    aggregateId: string,
    templateId: NotificationTemplateId,
    userId: string,
  ): DedupeKey {
    return new DedupeKey(`${eventType}:${aggregateId}:${templateId}:${userId}`);
  }

  /** The T−24h reminder sweep — historically has NO templateId segment. */
  static forReminder(bookingId: string, userId: string): DedupeKey {
    return new DedupeKey(`booking.reminder:${bookingId}:${userId}`);
  }

  /** Guest-lookup OTP — the code itself is part of the key (each code is its own delivery). */
  static forOtp(bookingId: string, userId: string, otp: string): DedupeKey {
    return new DedupeKey(`booking.otp:${bookingId}:${userId}:${otp}`);
  }
}
