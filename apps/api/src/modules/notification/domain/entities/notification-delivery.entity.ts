import type { NotificationTemplateId } from '../notification-plan';
import type { DedupeKey } from '../value-objects/dedupe-key';

/**
 * NotificationDelivery aggregate root (§17) — one attempted delivery of one template
 * to one recipient, i.e. one `notification_logs` row.
 *
 * Owns the rules that used to be scattered across six use-cases, an application
 * helper and the repository:
 *   - identity: the deterministic {@link DedupeKey} (was 6 copy-pasted string templates);
 *   - lifecycle pending → sent | failed, with `sentAt` set iff `sent` (was the repo's
 *     `entry.status === 'sent' ? new Date() : null`);
 *   - channel is `email` in Phase 1 (was hardcoded in two places);
 *   - {@link DeliveryPolicy}: whether a redelivery is deduped, and whether a send
 *     failure rethrows (outbox relay retries) or is swallowed (guest OTP path). That
 *     split used to be implicit in duplicated code.
 *
 * NOT owned here (deliberately): rendering (`renderEmail`), recipient/context
 * projection, and the `alreadySent` lookup — that is a persistence question backed by
 * the log table (no DB unique index exists; the check stays racy exactly as before).
 *
 * Framework-free: no Nest, no Prisma.
 */
export type DeliveryStatus = 'pending' | 'sent' | 'failed';

/** How this kind of delivery behaves on redelivery and on send failure. */
export interface DeliveryPolicy {
  /** Skip the send when a `sent` row already exists for the key. */
  dedupe: boolean;
  /** `rethrow` lets the outbox relay / reminder sweep retry; `swallow` is best-effort. */
  onFailure: 'rethrow' | 'swallow';
}

/** Outbox- and reminder-driven emails: deduped, and a failure retries via the relay. */
export const OUTBOX_DELIVERY_POLICY: DeliveryPolicy = { dedupe: true, onFailure: 'rethrow' };

/**
 * Guest-lookup OTP: never deduped (a resend of the same code must still reach the
 * guest) and never throws (it runs inside the guest's HTTP request; the code stays
 * valid in Redis so the guest can retry).
 */
export const OTP_DELIVERY_POLICY: DeliveryPolicy = { dedupe: false, onFailure: 'swallow' };

/** Everything needed to attempt one delivery. */
export interface DeliveryAttempt {
  tenantId: string;
  userId: string | null;
  recipientEmail: string;
  eventType: string;
  templateId: NotificationTemplateId;
  dedupeKey: DedupeKey;
  bookingId: string | null;
  policy: DeliveryPolicy;
}

/** The `notification_logs` row this delivery produces (the repo adds nothing but the key merge). */
export interface NotificationLogEntry {
  tenantId: string | null;
  userId: string | null;
  channel: 'email';
  eventType: string;
  recipient: string;
  status: DeliveryStatus;
  dedupeKey: string;
  error: string | null;
  sentAt: Date | null;
  payload: Record<string, unknown>;
}

export class NotificationDelivery {
  private _status: DeliveryStatus = 'pending';
  private _error: string | null = null;
  private _sentAt: Date | null = null;
  private _subject: string | null = null;

  private constructor(private readonly attempt: DeliveryAttempt) {}

  /** Begin an attempt (status `pending` until the send outcome is recorded). */
  static start(attempt: DeliveryAttempt): NotificationDelivery {
    return new NotificationDelivery(attempt);
  }

  get dedupeKey(): string {
    return this.attempt.dedupeKey.value;
  }

  get policy(): DeliveryPolicy {
    return this.attempt.policy;
  }

  get templateId(): NotificationTemplateId {
    return this.attempt.templateId;
  }

  get recipientEmail(): string {
    return this.attempt.recipientEmail;
  }

  /**
   * The email went out. `sentAt` is stamped here (app clock, supplied by the caller —
   * the same source the repository used before the refactor).
   */
  markSent(subject: string, now: Date): void {
    this._status = 'sent';
    this._subject = subject;
    this._sentAt = now;
    this._error = null;
  }

  /**
   * The send (or the `sent` log write) failed. Last-write-wins on purpose: if the
   * `sent` row fails to persist, the caller re-marks the attempt failed and records
   * that instead — the pre-refactor behaviour. A failed row never carries the subject,
   * even when the send itself had succeeded.
   */
  markFailed(error: string): void {
    this._status = 'failed';
    this._error = error;
    this._sentAt = null;
    this._subject = null;
  }

  /** The row to persist. Payload carries `subject` only on the success path. */
  logEntry(): NotificationLogEntry {
    if (this._status === 'pending') {
      throw new Error('logEntry() called before markSent()/markFailed() — nothing to record');
    }
    return {
      tenantId: this.attempt.tenantId,
      userId: this.attempt.userId,
      channel: 'email',
      eventType: this.attempt.eventType,
      recipient: this.attempt.recipientEmail,
      status: this._status,
      dedupeKey: this.dedupeKey,
      error: this._error,
      sentAt: this._sentAt,
      payload: {
        templateId: this.attempt.templateId,
        bookingId: this.attempt.bookingId,
        ...(this._subject !== null ? { subject: this._subject } : {}),
      },
    };
  }
}
