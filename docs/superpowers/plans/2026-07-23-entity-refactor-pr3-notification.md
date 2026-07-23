# PR #3 — NotificationDelivery aggregate (notification) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gom invariant rải rác nhất của toàn API — dedupe-key copy-paste 6 chỗ / 3 shape, và chính
sách thất bại rethrow-vs-swallow đang ẩn trong code trùng lặp — vào `NotificationDelivery` aggregate
+ `DedupeKey` VO, giữ hành vi y hệt.

**Architecture:** Theo spec
[`2026-07-23-api-entity-centric-refactor-design.md`](../specs/2026-07-23-api-entity-centric-refactor-design.md)
(§3 + style-gate) và khảo sát [`entity-centric-survey.md`](../../refactor/entity-centric-survey.md)
mục notification. Aggregate sở hữu: định danh (dedupeKey), vòng đời pending→sent|failed, quy tắc
`sentAt` iff sent, channel 'email' (Phase 1), và **DeliveryPolicy** (dedupe on/off + onFailure
rethrow/swallow). Nhờ policy tường minh, `deliverNotification` trở thành MỘT đường đi duy nhất cho cả
outbox lẫn OTP — xoá bản copy send/record trong `send-booking-otp`. Routing rải trong use-case
(payout payee filter, plan item hardcode) gom về `notification-plan.ts`.

**Tech Stack:** NestJS 11, Prisma (admin pool cho notification_logs), BullMQ, pnpm 10.13.1, Node 22.22.0.

## Global Constraints

- **KHÔNG test** (ADR 0005); verify = `typecheck` + `lint` + `build` + chạy app.
- **ADR 0006**: không service class; 1 use-case = 1 file, 1 `execute()`.
- **⚠️ DEDUPE KEY LÀ DỮ LIỆU LỊCH SỬ — byte-for-byte, không được xê dịch 1 ký tự.** Key nằm trong
  `notification_logs.payload->>'dedupeKey'` của các row đã gửi; đổi format = mọi row cũ vô hình với
  `alreadySent` = outbox redelivery **gửi lại email cũ cho khách thật**. 3 shape hiện hành:
  - event: `` `${eventType}:${aggregateId}:${templateId}:${userId}` `` (booking/listing/partner/payout;
    payout dùng eventType literal `payout.paid`, aggregateId = payoutId)
  - reminder: `` `booking.reminder:${bookingId}:${userId}` `` — **KHÔNG có segment templateId**
  - otp: `` `booking.otp:${bookingId}:${userId}:${otp}` ``
- **Không đụng schema/migration** (spec: schema-frozen). Cụ thể: **KHÔNG** thêm cột `dedupe_key`,
  **KHÔNG** thêm unique index. Guard `alreadySent` vẫn là read-then-write có race — giữ nguyên
  (đã ghi §8b của spec).
- **notification_logs KHÔNG đi qua `forTenant`/`PrismaTx`**: repo dùng `prisma.admin` (BYPASSRLS) vì
  `tenant_id` nullable và policy không có WITH CHECK cho app_user. **Tuyệt đối không "chuẩn hoá" repo
  này sang nhận `tx`** — insert sẽ fail dưới RLS.
- **Ghi log nằm NGOÀI transaction nghiệp vụ** (gửi email không transactional). Không bọc markSent
  trong tx nào.
- **Chính sách thất bại phải giữ nguyên đúng 2 nhánh**: outbox/reminder → ghi `failed` rồi **rethrow**
  (relay retry); OTP → ghi `failed` rồi **nuốt** (guest đang chờ HTTP, code vẫn còn hạn trong Redis).
  Đảo nhánh nào cũng là lỗi nghiêm trọng: no-throw hết → relay mất retry; throw hết → 500 endpoint OTP.
- **OTP không đi qua dedupe**: hôm nay path OTP không gọi `alreadySent` bao giờ. Giữ nguyên
  (`dedupe: false`) — nếu bật lên, lần gửi lại cùng một mã sẽ bị chặn và khách không nhận được email.
- **Row ghi vào notification_logs giữ nguyên từng field**: `channel:'email'`; payload khi sent =
  `{ templateId, bookingId, subject }`, khi failed = `{ templateId, bookingId }` (không có subject);
  repo merge thêm `dedupeKey`; `sentAt` = app-clock `new Date()` **chỉ khi sent**, ngược lại `null`;
  `error` = message khi failed, `null` khi sent.
- **Clock giữ app-clock**: `sentAt` dùng `new Date()` do helper cấp (đúng nguồn hiện tại). Cửa sổ
  reminder T−24h trong worker giữ `utcNow()` — **không đụng worker**.
- **Surface freeze**: `NotificationModule` vẫn export `SendBookingOtpUseCase` + `EMAIL_SENDER`
  (booking module import trực tiếp `SendBookingOtpUseCase` — sanctioned, không được đổi tên/chữ ký
  `execute(tenantId, bookingId, otp, expiresInSec)`). Danh sách event đăng ký outbox giữ nguyên.
- **Ngoại lệ duy nhất được phép đổi hành vi** (spec §4 bắt buộc khi PR đụng file đăng ký outbox):
  thay `event.tenantId ?? ''` bằng validate-and-skip-with-log. Hôm nay tenantId rỗng → `forTenant('')`
  → RLS trả rỗng → no-op thầm lặng; sau đổi → skip + log, kết quả ngoài y hệt (không email, event vẫn
  ack) nhưng thấy được.
- **Log text có đổi ở path OTP** (chấp nhận, không phải wire): message cũ
  `OTP email → x@y failed: …` (context `SendBookingOtpUseCase`) → sau khi dùng chung helper thành
  `email booking_otp_customer → x@y failed: …` (context `NotificationDelivery`). Ghi rõ trong PR body.
- Domain framework-free (chỉ `import type` từ shared/contracts nội bộ, không Nest/Prisma).
  Style-gate: private field `_x` + accessor, defensive branch dùng `Error` thường (→500).
- Node **22.22.0** (`nvm use`), chỉ **pnpm**. Không đụng container/process của project khác
  (`kaigo-postgres-dev`, `cf-connect-be`); smoke dùng `PORT=3001` nếu 3000 bận.
- Branch **`refactor/entity-notification`** (từ `refactor/entity-centric`), PR vào
  `refactor/entity-centric`.

---

### Task 1: Branch + domain — DedupeKey VO + NotificationDelivery aggregate

**Files:**
- Create: `apps/api/src/modules/notification/domain/value-objects/dedupe-key.ts`
- Create: `apps/api/src/modules/notification/domain/entities/notification-delivery.entity.ts`

**Interfaces:**
- Consumes: `NotificationTemplateId` (`../notification-plan`).
- Produces (Task 3 dùng đúng tên này): `DedupeKey` với `static forEvent(eventType, aggregateId,
  templateId, userId)`, `static forReminder(bookingId, userId)`, `static forOtp(bookingId, userId,
  otp)`, `.value`; `DeliveryPolicy`, hằng `OUTBOX_DELIVERY_POLICY` / `OTP_DELIVERY_POLICY`;
  `DeliveryAttempt`, `NotificationLogEntry`, `DeliveryStatus`; class `NotificationDelivery` với
  `static start(attempt)`, getters `dedupeKey`/`policy`/`templateId`/`recipientEmail`,
  `markSent(subject, now)`, `markFailed(error)`, `logEntry()`.

- [ ] **Step 1: Tạo branch**

```bash
cd "/Volumes/OVEN Duy/temp/booking-saas"
git checkout refactor/entity-centric && git pull origin refactor/entity-centric
git checkout -b refactor/entity-notification
```

- [ ] **Step 2: Viết `domain/value-objects/dedupe-key.ts`**

```ts
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
```

- [ ] **Step 3: Viết `domain/entities/notification-delivery.entity.ts`**

```ts
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
   * that instead — the pre-refactor behaviour.
   */
  markFailed(error: string): void {
    this._status = 'failed';
    this._error = error;
    this._sentAt = null;
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
```

- [ ] **Step 4: Typecheck** — `pnpm --filter=@booking/api typecheck`, expect exit 0.
- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/notification/domain
git commit -m "feat(notification): DedupeKey VO + NotificationDelivery aggregate

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Domain routing policy — payout/reminder plan + locale + payout data

**Files:**
- Modify: `apps/api/src/modules/notification/domain/notification-plan.ts` (thêm cuối file)
- Modify: `apps/api/src/modules/notification/domain/email-template.ts:35` (export `normalizeLocale`)
- Modify: `apps/api/src/modules/notification/domain/booking-notification-data.ts:28` (dùng `normalizeLocale`)
- Create: `apps/api/src/modules/notification/domain/payout-notification-data.ts`

**Interfaces:**
- Produces: `planForPayout(payload)`, `REMINDER_PLAN_ITEM`, `normalizeLocale(locale)` (nay export),
  `payoutTemplateData(ctx, recipient, payload)`.

- [ ] **Step 1: `notification-plan.ts` — thêm vào CUỐI file (không sửa gì phía trên)**

```ts
/**
 * payout.paid routing. Only partner payouts have a Phase-1 template — an affiliate
 * payout produces no notification (this filter used to sit in the use-case).
 */
export function planForPayout(payload: { payeeType: string }): NotificationPlanItem[] {
  return payload.payeeType === 'partner'
    ? [{ audience: 'partner', templateId: 'payout_paid_partner' }]
    : [];
}

/** The T−24h reminder addresses the booking's customer (was hardcoded in the use-case). */
export const REMINDER_PLAN_ITEM: NotificationPlanItem = {
  audience: 'customer',
  templateId: 'booking_reminder_customer',
};
```

- [ ] **Step 2: `email-template.ts` — export `normalizeLocale`**

Đổi dòng 35 từ `function normalizeLocale(` thành `export function normalizeLocale(`
(giữ nguyên thân hàm + mọi chỗ dùng nội bộ). Thêm doc comment ngay trên:

```ts
/** The recipient's locale, normalized to a supported one (`vi` is the fallback). */
```

- [ ] **Step 3: `booking-notification-data.ts` — dùng `normalizeLocale`**

Đổi import dòng 3 thành:

```ts
import { normalizeLocale, type TemplateData } from './email-template';
```

và dòng 28 từ `const locale = recipient.locale === 'en' ? 'en' : 'vi';` thành:

```ts
  const locale = normalizeLocale(recipient.locale);
```

(Kết quả giống hệt: cả hai trả `'en'` khi locale === 'en', ngược lại `'vi'`.)

- [ ] **Step 4: Viết `domain/payout-notification-data.ts`**

```ts
import { formatVnd } from '../../../shared/money/money';
import { normalizeLocale, type TemplateData } from './email-template';
import type { NotificationRecipient, PartnerNotificationContext } from './ports/notification-reader.port';

/**
 * Template data for `payout.paid` — the parallel of `bookingTemplateData` for the
 * payout email. The amount arrives as a decimal string on the outbox payload (bigint
 * never crosses the event boundary) and is formatted in the recipient's locale.
 */
export function payoutTemplateData(
  ctx: PartnerNotificationContext,
  recipient: NotificationRecipient,
  payload: { amount: string },
): TemplateData {
  const locale = normalizeLocale(recipient.locale);
  return {
    tenantName: ctx.tenantName,
    recipientName: recipient.name,
    partnerName: ctx.partnerName,
    amount: formatVnd(BigInt(payload.amount), locale),
  };
}
```

- [ ] **Step 5: Typecheck + lint** — cả hai exit 0.
- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/notification/domain
git commit -m "refactor(notification): gom routing payout/reminder + locale + payout data về domain

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Delivery pipeline — helper hợp nhất + port + repo + 6 use-cases

**Files:**
- Rewrite: `apps/api/src/modules/notification/application/deliver-notification.ts`
- Rewrite: `apps/api/src/modules/notification/domain/ports/notification-log-repository.port.ts`
- Modify: `apps/api/src/modules/notification/infrastructure/repositories/prisma-notification-log.repository.ts`
- Rewrite: 6 file trong `apps/api/src/modules/notification/application/use-cases/`

**Interfaces:**
- Consumes: mọi tên từ Task 1 + Task 2.
- Produces: `deliverNotification(ports, delivery, render)`; port `INotificationLogRepository
  { alreadySent(dedupeKey), record(entry: NotificationLogEntry) }` (bỏ `NotificationLogRecord`).

- [ ] **Step 1: Viết lại `deliver-notification.ts`** (toàn bộ file)

```ts
import { Logger } from '@nestjs/common';
import { renderEmail, type TemplateData } from '../domain/email-template';
import type { NotificationDelivery } from '../domain/entities/notification-delivery.entity';
import type { IEmailSender } from '../domain/ports/email-sender.port';
import type { INotificationLogRepository } from '../domain/ports/notification-log-repository.port';

const logger = new Logger('NotificationDelivery');

/** The ports a delivery needs — injected by the calling use-case and passed through. */
export interface DeliveryPorts {
  email: IEmailSender;
  logs: INotificationLogRepository;
}

/**
 * Renders + sends one email and records the outcome in `notification_logs` (§17).
 * The single delivery path for BOTH the outbox dispatchers and the synchronous OTP —
 * their differences live in the aggregate's {@link DeliveryPolicy}, not in duplicated
 * code: outbox deliveries skip an already-sent key and rethrow on failure so the relay
 * retries; the OTP always sends and swallows failures.
 *
 * Log writes are deliberately outside any business transaction — an email send is not
 * transactional, and a rolled-back `sent` row would mean a duplicate email on retry.
 */
export async function deliverNotification(
  ports: DeliveryPorts,
  delivery: NotificationDelivery,
  render: { locale: string; data: TemplateData },
): Promise<void> {
  const { dedupe, onFailure } = delivery.policy;
  if (dedupe && (await ports.logs.alreadySent(delivery.dedupeKey))) return;
  const content = renderEmail(delivery.templateId, render.locale, render.data);
  try {
    await ports.email.send({
      to: delivery.recipientEmail,
      subject: content.subject,
      text: content.text,
      html: content.html,
    });
    delivery.markSent(content.subject, new Date());
    await ports.logs.record(delivery.logEntry());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`email ${delivery.templateId} → ${delivery.recipientEmail} failed: ${message}`);
    delivery.markFailed(message);
    await ports.logs.record(delivery.logEntry());
    if (onFailure === 'rethrow') throw error; // let the outbox relay retry
  }
}
```

- [ ] **Step 2: Viết lại `notification-log-repository.port.ts`** (toàn bộ file)

```ts
import type { NotificationLogEntry } from '../entities/notification-delivery.entity';

export const NOTIFICATION_LOG_REPOSITORY = Symbol('NOTIFICATION_LOG_REPOSITORY');

/**
 * `notification_logs` access. Writes go through the BYPASSRLS admin pool because
 * `tenant_id` can be null (platform-wide rows) and the RLS policy has no WITH CHECK
 * for the app_user role — same shape as outbox_events / audit_logs. This port takes
 * NO `PrismaTx` on purpose: a delivery log must not join a business transaction.
 */
export interface INotificationLogRepository {
  /** True once a `sent` row exists for this dedupe key (guards outbox retries). */
  alreadySent(dedupeKey: string): Promise<boolean>;
  record(entry: NotificationLogEntry): Promise<void>;
}
```

- [ ] **Step 3: Sửa `prisma-notification-log.repository.ts`**

Đổi khối import (dòng 4-7) thành:

```ts
import type { NotificationLogEntry } from '../../domain/entities/notification-delivery.entity';
import type { INotificationLogRepository } from '../../domain/ports/notification-log-repository.port';
```

Giữ nguyên `alreadySent`. Thay `record` bằng (chỉ khác: nhận `sentAt`/`error` từ entity thay vì tự suy):

```ts
  async record(entry: NotificationLogEntry): Promise<void> {
    await this.prisma.admin.notificationLog.create({
      data: {
        tenantId: entry.tenantId,
        userId: entry.userId,
        channel: entry.channel,
        eventType: entry.eventType,
        recipient: entry.recipient,
        status: entry.status,
        error: entry.error,
        sentAt: entry.sentAt,
        payload: { ...entry.payload, dedupeKey: entry.dedupeKey } as Prisma.InputJsonValue,
      },
    });
  }
```

- [ ] **Step 4: Viết lại `dispatch-booking-event.use-case.ts`** (toàn bộ file)

```ts
import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { audienceRecipients, bookingTemplateData } from '../../domain/booking-notification-data';
import {
  NotificationDelivery,
  OUTBOX_DELIVERY_POLICY,
} from '../../domain/entities/notification-delivery.entity';
import { planForEvent } from '../../domain/notification-plan';
import { EMAIL_SENDER, type IEmailSender } from '../../domain/ports/email-sender.port';
import {
  NOTIFICATION_LOG_REPOSITORY,
  type INotificationLogRepository,
} from '../../domain/ports/notification-log-repository.port';
import {
  NOTIFICATION_READER,
  type INotificationReader,
} from '../../domain/ports/notification-reader.port';
import { DedupeKey } from '../../domain/value-objects/dedupe-key';
import { deliverNotification } from '../deliver-notification';

export interface BookingEventPayload {
  bookingId: string;
  status?: string;
  refundAmount?: string;
  reason?: string;
}

/**
 * booking.* events (created/approved/confirmed/cancelled/completed/no_show/rejected)
 * → emails (§17). Idempotent by design: the delivery's dedupe key skips a resend, so
 * an at-least-once outbox redelivery never sends a second email. One delivery failure
 * rethrows so the relay retries — already-sent recipients are skipped.
 */
@Injectable()
export class DispatchBookingEventUseCase {
  constructor(
    @Inject(NOTIFICATION_READER) private readonly reader: INotificationReader,
    @Inject(EMAIL_SENDER) private readonly email: IEmailSender,
    @Inject(NOTIFICATION_LOG_REPOSITORY) private readonly logs: INotificationLogRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, eventType: string, payload: BookingEventPayload): Promise<void> {
    const plan = planForEvent(eventType, payload);
    if (plan.length === 0) return;
    const ctx = await this.tenantDb.forTenant(tenantId, (tx) =>
      this.reader.loadBookingContext(tx, payload.bookingId),
    );
    if (!ctx) return;

    for (const item of plan) {
      for (const recipient of audienceRecipients(item, ctx)) {
        const delivery = NotificationDelivery.start({
          tenantId,
          userId: recipient.userId,
          recipientEmail: recipient.email,
          eventType,
          templateId: item.templateId,
          dedupeKey: DedupeKey.forEvent(
            eventType,
            ctx.bookingId,
            item.templateId,
            recipient.userId,
          ),
          bookingId: ctx.bookingId,
          policy: OUTBOX_DELIVERY_POLICY,
        });
        await deliverNotification({ email: this.email, logs: this.logs }, delivery, {
          locale: recipient.locale,
          data: bookingTemplateData(ctx, recipient, payload),
        });
      }
    }
  }
}
```

- [ ] **Step 5: Viết lại `dispatch-listing-event.use-case.ts`** (toàn bộ file)

```ts
import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { type TemplateData } from '../../domain/email-template';
import {
  NotificationDelivery,
  OUTBOX_DELIVERY_POLICY,
} from '../../domain/entities/notification-delivery.entity';
import { planForEvent } from '../../domain/notification-plan';
import { EMAIL_SENDER, type IEmailSender } from '../../domain/ports/email-sender.port';
import {
  NOTIFICATION_LOG_REPOSITORY,
  type INotificationLogRepository,
} from '../../domain/ports/notification-log-repository.port';
import {
  NOTIFICATION_READER,
  type INotificationReader,
} from '../../domain/ports/notification-reader.port';
import { DedupeKey } from '../../domain/value-objects/dedupe-key';
import { deliverNotification } from '../deliver-notification';

/**
 * listing.published / listing.hidden → the owning partner's members (§17).
 * Idempotent via the delivery dedupe key; a failure rethrows so the outbox relay retries.
 */
@Injectable()
export class DispatchListingEventUseCase {
  constructor(
    @Inject(NOTIFICATION_READER) private readonly reader: INotificationReader,
    @Inject(EMAIL_SENDER) private readonly email: IEmailSender,
    @Inject(NOTIFICATION_LOG_REPOSITORY) private readonly logs: INotificationLogRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    eventType: string,
    payload: { listingId: string; reason?: string },
  ): Promise<void> {
    const plan = planForEvent(eventType, {});
    if (plan.length === 0) return;
    const ctx = await this.tenantDb.forTenant(tenantId, (tx) =>
      this.reader.loadListingContext(tx, payload.listingId),
    );
    if (!ctx) return;
    for (const item of plan) {
      for (const recipient of ctx.partnerRecipients) {
        const data: TemplateData = {
          tenantName: ctx.tenantName,
          recipientName: recipient.name,
          listingTitle: ctx.listingTitle,
          reason: payload.reason,
        };
        const delivery = NotificationDelivery.start({
          tenantId,
          userId: recipient.userId,
          recipientEmail: recipient.email,
          eventType,
          templateId: item.templateId,
          dedupeKey: DedupeKey.forEvent(
            eventType,
            payload.listingId,
            item.templateId,
            recipient.userId,
          ),
          bookingId: null,
          policy: OUTBOX_DELIVERY_POLICY,
        });
        await deliverNotification({ email: this.email, logs: this.logs }, delivery, {
          locale: recipient.locale,
          data,
        });
      }
    }
  }
}
```

- [ ] **Step 6: Viết lại `dispatch-partner-event.use-case.ts`** (toàn bộ file)

```ts
import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { type TemplateData } from '../../domain/email-template';
import {
  NotificationDelivery,
  OUTBOX_DELIVERY_POLICY,
} from '../../domain/entities/notification-delivery.entity';
import { planForEvent } from '../../domain/notification-plan';
import { EMAIL_SENDER, type IEmailSender } from '../../domain/ports/email-sender.port';
import {
  NOTIFICATION_LOG_REPOSITORY,
  type INotificationLogRepository,
} from '../../domain/ports/notification-log-repository.port';
import {
  NOTIFICATION_READER,
  type INotificationReader,
} from '../../domain/ports/notification-reader.port';
import { DedupeKey } from '../../domain/value-objects/dedupe-key';
import { deliverNotification } from '../deliver-notification';

/**
 * partner.approved → the partner's members (§17). Idempotent via the delivery dedupe
 * key; a failure rethrows so the outbox relay retries.
 */
@Injectable()
export class DispatchPartnerEventUseCase {
  constructor(
    @Inject(NOTIFICATION_READER) private readonly reader: INotificationReader,
    @Inject(EMAIL_SENDER) private readonly email: IEmailSender,
    @Inject(NOTIFICATION_LOG_REPOSITORY) private readonly logs: INotificationLogRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, eventType: string, payload: { partnerId: string }): Promise<void> {
    const plan = planForEvent(eventType, {});
    if (plan.length === 0) return;
    const ctx = await this.tenantDb.forTenant(tenantId, (tx) =>
      this.reader.loadPartnerContext(tx, payload.partnerId),
    );
    if (!ctx) return;
    for (const item of plan) {
      for (const recipient of ctx.recipients) {
        const data: TemplateData = {
          tenantName: ctx.tenantName,
          recipientName: recipient.name,
          partnerName: ctx.partnerName,
        };
        const delivery = NotificationDelivery.start({
          tenantId,
          userId: recipient.userId,
          recipientEmail: recipient.email,
          eventType,
          templateId: item.templateId,
          dedupeKey: DedupeKey.forEvent(
            eventType,
            payload.partnerId,
            item.templateId,
            recipient.userId,
          ),
          bookingId: null,
          policy: OUTBOX_DELIVERY_POLICY,
        });
        await deliverNotification({ email: this.email, logs: this.logs }, delivery, {
          locale: recipient.locale,
          data,
        });
      }
    }
  }
}
```

- [ ] **Step 7: Viết lại `dispatch-payout-event.use-case.ts`** (toàn bộ file)

```ts
import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  NotificationDelivery,
  OUTBOX_DELIVERY_POLICY,
} from '../../domain/entities/notification-delivery.entity';
import { planForPayout } from '../../domain/notification-plan';
import { payoutTemplateData } from '../../domain/payout-notification-data';
import { EMAIL_SENDER, type IEmailSender } from '../../domain/ports/email-sender.port';
import {
  NOTIFICATION_LOG_REPOSITORY,
  type INotificationLogRepository,
} from '../../domain/ports/notification-log-repository.port';
import {
  NOTIFICATION_READER,
  type INotificationReader,
} from '../../domain/ports/notification-reader.port';
import { DedupeKey } from '../../domain/value-objects/dedupe-key';
import { deliverNotification } from '../deliver-notification';

/**
 * payout.paid → the partner's members (§17; affiliate payouts have no Phase-1
 * template — see `planForPayout`). Idempotent via the delivery dedupe key; a failure
 * rethrows so the outbox relay retries.
 */
@Injectable()
export class DispatchPayoutEventUseCase {
  constructor(
    @Inject(NOTIFICATION_READER) private readonly reader: INotificationReader,
    @Inject(EMAIL_SENDER) private readonly email: IEmailSender,
    @Inject(NOTIFICATION_LOG_REPOSITORY) private readonly logs: INotificationLogRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    payload: { payoutId: string; payeeType: string; payeeId: string; amount: string },
  ): Promise<void> {
    const plan = planForPayout(payload);
    if (plan.length === 0) return;
    const ctx = await this.tenantDb.forTenant(tenantId, (tx) =>
      this.reader.loadPartnerContext(tx, payload.payeeId),
    );
    if (!ctx) return;
    for (const item of plan) {
      for (const recipient of ctx.recipients) {
        const delivery = NotificationDelivery.start({
          tenantId,
          userId: recipient.userId,
          recipientEmail: recipient.email,
          eventType: 'payout.paid',
          templateId: item.templateId,
          dedupeKey: DedupeKey.forEvent(
            'payout.paid',
            payload.payoutId,
            item.templateId,
            recipient.userId,
          ),
          bookingId: null,
          policy: OUTBOX_DELIVERY_POLICY,
        });
        await deliverNotification({ email: this.email, logs: this.logs }, delivery, {
          locale: recipient.locale,
          data: payoutTemplateData(ctx, recipient, payload),
        });
      }
    }
  }
}
```

- [ ] **Step 8: Viết lại `dispatch-reminder.use-case.ts`** (toàn bộ file)

```ts
import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { bookingTemplateData } from '../../domain/booking-notification-data';
import {
  NotificationDelivery,
  OUTBOX_DELIVERY_POLICY,
} from '../../domain/entities/notification-delivery.entity';
import { REMINDER_PLAN_ITEM } from '../../domain/notification-plan';
import { EMAIL_SENDER, type IEmailSender } from '../../domain/ports/email-sender.port';
import {
  NOTIFICATION_LOG_REPOSITORY,
  type INotificationLogRepository,
} from '../../domain/ports/notification-log-repository.port';
import {
  NOTIFICATION_READER,
  type INotificationReader,
} from '../../domain/ports/notification-reader.port';
import { DedupeKey } from '../../domain/value-objects/dedupe-key';
import { deliverNotification } from '../deliver-notification';

/**
 * Reminder job → the booking's customer (§17 BookingReminder T−24h). Idempotent via
 * the delivery dedupe key, so overlapping poll sweeps never resend; a failure rethrows
 * so the sweep can log it.
 */
@Injectable()
export class DispatchReminderUseCase {
  constructor(
    @Inject(NOTIFICATION_READER) private readonly reader: INotificationReader,
    @Inject(EMAIL_SENDER) private readonly email: IEmailSender,
    @Inject(NOTIFICATION_LOG_REPOSITORY) private readonly logs: INotificationLogRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, bookingId: string): Promise<void> {
    const ctx = await this.tenantDb.forTenant(tenantId, (tx) =>
      this.reader.loadBookingContext(tx, bookingId),
    );
    if (!ctx?.customer) return;
    const customer = ctx.customer;
    const delivery = NotificationDelivery.start({
      tenantId,
      userId: customer.userId,
      recipientEmail: customer.email,
      eventType: 'booking.reminder',
      templateId: REMINDER_PLAN_ITEM.templateId,
      dedupeKey: DedupeKey.forReminder(bookingId, customer.userId),
      bookingId,
      policy: OUTBOX_DELIVERY_POLICY,
    });
    await deliverNotification({ email: this.email, logs: this.logs }, delivery, {
      locale: customer.locale,
      data: bookingTemplateData(ctx, customer, {}),
    });
  }
}
```

- [ ] **Step 9: Viết lại `send-booking-otp.use-case.ts`** (toàn bộ file — bản copy send/record biến mất)

```ts
import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { type TemplateData } from '../../domain/email-template';
import {
  NotificationDelivery,
  OTP_DELIVERY_POLICY,
} from '../../domain/entities/notification-delivery.entity';
import { EMAIL_SENDER, type IEmailSender } from '../../domain/ports/email-sender.port';
import {
  NOTIFICATION_LOG_REPOSITORY,
  type INotificationLogRepository,
} from '../../domain/ports/notification-log-repository.port';
import {
  NOTIFICATION_READER,
  type INotificationReader,
} from '../../domain/ports/notification-reader.port';
import { DedupeKey } from '../../domain/value-objects/dedupe-key';
import { deliverNotification } from '../deliver-notification';

/**
 * Sends a guest-lookup OTP synchronously (§8.6). The plaintext code exists only at
 * issue time and is never persisted, so it cannot ride the async outbox — the booking
 * use-case calls this directly. Its {@link OTP_DELIVERY_POLICY} says it all: never
 * deduped (each request must reach the guest, even for a resent code) and never throws
 * (the code stays valid in Redis, so the guest can retry).
 */
@Injectable()
export class SendBookingOtpUseCase {
  constructor(
    @Inject(NOTIFICATION_READER) private readonly reader: INotificationReader,
    @Inject(EMAIL_SENDER) private readonly email: IEmailSender,
    @Inject(NOTIFICATION_LOG_REPOSITORY) private readonly logs: INotificationLogRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    bookingId: string,
    otp: string,
    expiresInSec: number,
  ): Promise<void> {
    const ctx = await this.tenantDb.forTenant(tenantId, (tx) =>
      this.reader.loadBookingContext(tx, bookingId),
    );
    if (!ctx?.customer) return;
    const recipient = ctx.customer;
    const data: TemplateData = {
      tenantName: ctx.tenantName,
      recipientName: recipient.name,
      bookingCode: ctx.code,
      otp,
      expiresInMin: Math.max(1, Math.round(expiresInSec / 60)),
    };
    const delivery = NotificationDelivery.start({
      tenantId,
      userId: recipient.userId,
      recipientEmail: recipient.email,
      eventType: 'booking.otp',
      templateId: 'booking_otp_customer',
      dedupeKey: DedupeKey.forOtp(bookingId, recipient.userId, otp),
      bookingId,
      policy: OTP_DELIVERY_POLICY,
    });
    await deliverNotification({ email: this.email, logs: this.logs }, delivery, {
      locale: recipient.locale,
      data,
    });
  }
}
```

- [ ] **Step 10: Typecheck + lint + build** — cả 3 exit 0.

- [ ] **Step 11: Đối chiếu (đọc, không chạy)** — `git diff HEAD -- apps/api/src/modules/notification`

| Điểm | Cũ | Mới |
|---|---|---|
| dedupe key booking | `${eventType}:${ctx.bookingId}:${item.templateId}:${recipient.userId}` | `DedupeKey.forEvent(eventType, ctx.bookingId, item.templateId, recipient.userId)` → cùng chuỗi |
| dedupe key listing/partner | `${eventType}:${listingId|partnerId}:${templateId}:${userId}` | `forEvent(...)` cùng chuỗi |
| dedupe key payout | `payout.paid:${payoutId}:${templateId}:${userId}` | `forEvent('payout.paid', payoutId, …)` cùng chuỗi |
| dedupe key reminder | `booking.reminder:${bookingId}:${userId}` (không templateId) | `forReminder(...)` cùng chuỗi |
| dedupe key OTP | `booking.otp:${bookingId}:${userId}:${otp}` | `forOtp(...)` cùng chuỗi |
| alreadySent | luôn gọi (outbox + reminder); OTP không gọi | `policy.dedupe` — outbox/reminder true, OTP false → y hệt |
| thất bại outbox/reminder | record failed + `throw` | `onFailure:'rethrow'` → `throw error` (đúng error gốc) |
| thất bại OTP | record failed, không throw | `onFailure:'swallow'` → không throw |
| sentAt | repo: `status==='sent' ? new Date() : null` | entity nhận `new Date()` từ helper khi sent; failed → null |
| payload sent | `{ templateId, bookingId, subject }` | y hệt |
| payload failed | `{ templateId, bookingId }` | y hệt (không có subject) |
| channel | `'email'` | `'email'` (entity cố định) |
| payout filter | `if (payload.payeeType !== 'partner') return` | `planForPayout` trả `[]` → `return` |
| repo dùng admin pool, không nhận tx | có | không đổi |

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/modules/notification
git commit -m "refactor(notification): delivery pipeline qua NotificationDelivery aggregate

Dedupe key 6 bản copy → DedupeKey VO (3 shape byte-identical); chính sách
dedupe/rethrow-vs-swallow thành DeliveryPolicy tường minh nên OTP và outbox
dùng chung một đường gửi; sentAt iff sent về entity. Log row byte-identical.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Outbox wiring — validate tenantId + docs

**Files:**
- Modify: `apps/api/src/modules/notification/infrastructure/http/notification.module.ts`
- Modify: `apps/api/CLAUDE.md` (danh sách module đã refactor)

- [ ] **Step 1: `notification.module.ts` — validate-and-skip-with-log**

Thêm `Logger` vào import Nest dòng 1:

```ts
import { Logger, Module, type OnModuleInit } from '@nestjs/common';
```

Thêm field + helper trong class `NotificationModule` (ngay trước constructor):

```ts
  private readonly logger = new Logger(NotificationModule.name);
```

Thay 4 vòng `register` trong `onModuleInit` bằng (mỗi handler validate tenantId trước):

```ts
  onModuleInit(): void {
    for (const eventType of BOOKING_NOTIFICATION_EVENTS) {
      this.registry.register(eventType, (event) => {
        const tenantId = this.requireTenantId(event.eventType, event.tenantId);
        if (!tenantId) return Promise.resolve();
        return this.dispatchBookingEvent.execute(tenantId, event.eventType, payloadOf(event.payload));
      });
    }
    for (const eventType of LISTING_NOTIFICATION_EVENTS) {
      this.registry.register(eventType, (event) => {
        const tenantId = this.requireTenantId(event.eventType, event.tenantId);
        if (!tenantId) return Promise.resolve();
        return this.dispatchListingEvent.execute(tenantId, event.eventType, payloadOf(event.payload));
      });
    }
    for (const eventType of PARTNER_NOTIFICATION_EVENTS) {
      this.registry.register(eventType, (event) => {
        const tenantId = this.requireTenantId(event.eventType, event.tenantId);
        if (!tenantId) return Promise.resolve();
        return this.dispatchPartnerEvent.execute(tenantId, event.eventType, payloadOf(event.payload));
      });
    }
    for (const eventType of PAYOUT_NOTIFICATION_EVENTS) {
      this.registry.register(eventType, (event) => {
        const tenantId = this.requireTenantId(event.eventType, event.tenantId);
        if (!tenantId) return Promise.resolve();
        return this.dispatchPayoutEvent.execute(tenantId, payoutPayloadOf(event.payload));
      });
    }
  }

  /**
   * A tenant-scoped notification event without a tenant id cannot be routed: skip it
   * (and say so) instead of running `forTenant('')`, which silently resolved to an
   * empty RLS scope and no-op'd. Skipping — not throwing — keeps the at-least-once
   * relay from parking the event in permanent retry (there is no dead-letter queue).
   */
  private requireTenantId(eventType: string, tenantId: string | null): string | null {
    if (tenantId) return tenantId;
    this.logger.warn(`skipping ${eventType}: outbox event has no tenantId`);
    return null;
  }
```

Nếu type của `event.tenantId` không phải `string | null` (kiểm tra
`shared/outbox/outbox-handler.registry.ts`), chỉnh signature `requireTenantId` cho khớp — không đổi
logic.

- [ ] **Step 2: `apps/api/CLAUDE.md`** — đổi `Refactored so far: **reviews, content-reports**.` thành
  `Refactored so far: **reviews, content-reports, notification**.`

- [ ] **Step 3: Typecheck + lint + build** — cả 3 exit 0.
- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/notification apps/api/CLAUDE.md
git commit -m "refactor(notification): outbox handler validate tenantId thay vì forTenant('')

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Verify toàn bộ + runtime smoke + PR

- [ ] **Step 1: Full suite** — `nvm use` rồi `pnpm turbo lint typecheck build`. Expected: xanh hết.

- [ ] **Step 2: Hạ tầng + API** — `docker ps` kiểm tra postgres/redis/**mailpit** đã chạy (mailpit
  bắt buộc cho smoke này); `prisma:deploy`/`seed` nếu cần; boot riêng API
  (`PORT=3001 pnpm --filter=@booking/api dev`), chờ "Nest application successfully started". Kill khi
  xong.

- [ ] **Step 3: Headless smoke — email THẬT qua Mailpit (`localhost:8025`, REST API `/api/v1/messages`)**

Module này không có endpoint HTTP nào, nên smoke đi qua đường sinh event thật:

1. **OTP (path swallow, không dedupe)** — gọi endpoint guest-lookup OTP của booking module (tìm
   trong `apps/api/src/modules/booking/infrastructure/http/`, use-case
   `request-booking-otp.use-case.ts`) với 1 booking có customer. Kỳ vọng: 2xx; Mailpit nhận email
   `booking_otp_customer`; psql `notification_logs` có row `event_type='booking.otp'`,
   `status='sent'`, `sent_at` khác null, `payload->>'dedupeKey'` đúng dạng
   `booking.otp:<bookingId>:<userId>:<otp>` và payload có `subject`.
2. **Gọi LẠI OTP** → phải có email THỨ HAI (chứng minh `dedupe:false` giữ nguyên — nếu chỉ có 1
   email thì đã regress).
3. **Outbox booking event (path rethrow + dedupe)** — tạo/di chuyển 1 booking để sinh event
   `booking.*` (ví dụ tạo booking mới qua storefront/API, hoặc partner confirm). Kỳ vọng: Mailpit
   nhận email; `notification_logs` có row `status='sent'` với dedupeKey dạng
   `<eventType>:<bookingId>:<templateId>:<userId>`.
4. **Dedupe** — bắt outbox relay giao lại chính event đó:
   ```sql
   UPDATE outbox_events SET processed_at = NULL, attempts = 0
   WHERE event_type = '<eventType>' AND id = '<id>';
   ```
   Chờ ≤ 1 chu kỳ relay (poll 2s). Kỳ vọng: **KHÔNG có email thứ hai** trong Mailpit và **không có
   row notification_logs mới** cho dedupeKey đó (guard alreadySent còn nguyên).
5. **Key lịch sử** — psql kiểm tra các row `notification_logs` cũ (trước PR này, nếu seed/dev có) và
   row mới **cùng một dạng chuỗi** cho cùng loại event — không có tiền tố/segment mới nào.
6. **Reminder** (nếu chạy được) — gọi `ReminderWorker.sweep()` gián tiếp bằng cách chờ tick, hoặc bỏ
   qua và ghi rõ trong report; nếu có, kiểm dedupeKey `booking.reminder:<bookingId>:<userId>`
   (KHÔNG có templateId).
7. **tenantId rỗng** — psql chèn 1 outbox event thủ công không tenant_id:
   ```sql
   INSERT INTO outbox_events (id, tenant_id, event_type, payload, created_at)
   VALUES (gen_random_uuid(), NULL, 'partner.approved', '{"partnerId":"<uuid bất kỳ>"}'::jsonb, now());
   ```
   Kỳ vọng: log API có dòng `skipping partner.approved: outbox event has no tenantId`, event được
   ack (processed_at khác null), không email, không row notification_logs. (Kiểm tra tên cột thật
   của bảng `outbox_events` trước khi INSERT.)

- [ ] **Step 4: Push + PR**

```bash
git push -u origin refactor/entity-notification
gh pr create --base refactor/entity-centric --title "refactor(notification): PR #3 — NotificationDelivery aggregate + DedupeKey VO" --body "$(cat <<'EOF'
PR #3 của entity-centric refactor (spec docs/superpowers/specs/2026-07-23-api-entity-centric-refactor-design.md).

- DedupeKey VO: 6 bản copy-paste / 3 shape → 1 nơi, chuỗi byte-identical (key là DỮ LIỆU LỊCH SỬ trong notification_logs.payload->>'dedupeKey')
- NotificationDelivery aggregate: vòng đời pending→sent|failed, sentAt iff sent (dời khỏi repo), channel 'email' Phase 1
- DeliveryPolicy tường minh (dedupe on/off + rethrow/swallow) ⇒ OTP và outbox dùng CHUNG một đường gửi; bản copy send/record trong send-booking-otp bị xoá
- Routing payout/reminder gom về notification-plan.ts; normalizeLocale hết bị nhân bản
- Outbox handler: `event.tenantId ?? ''` → validate-and-skip-with-log (normalization được spec §4 cho phép; hành vi ngoài y hệt: không email, event vẫn ack)

Giữ nguyên tuyệt đối: format dedupe key, log row (payload/sentAt/error/channel), repo trên admin pool không nhận tx, log ghi ngoài transaction, chính sách rethrow (outbox/reminder) vs swallow (OTP), OTP không dedupe, app-clock, export SendBookingOtpUseCase + EMAIL_SENDER.
Không đụng schema (không thêm cột/unique index cho dedupe — vẫn là follow-up §8b).
Delta duy nhất ngoài wire: dòng log cảnh báo path OTP đổi format/context (logs, không phải wire).

Verify: pnpm turbo lint typecheck build xanh + smoke qua Mailpit (OTP gửi 2 lần đều tới, outbox event gửi 1 lần, replay event KHÔNG gửi lại, event thiếu tenantId bị skip có log).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5:** Báo controller kết quả — KHÔNG tự merge, KHÔNG tự làm PR #4.
