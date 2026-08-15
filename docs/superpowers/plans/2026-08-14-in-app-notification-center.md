# In-App Notification Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a notification bell to the dashboard shell, backed by a real per-user inbox, so tenant staff and partners see what needs their attention without hunting through screens.

**Architecture:** One `notifications` table, fanned out one row per recipient at write time. Two producer paths feed it: every partner/affiliate email also drops a bell row through the existing `deliverNotification` funnel, and nine tenant-facing outbox events produce in-app-only rows routed to staff by permission. The dashboard polls an unread count every 60 seconds through a resource route.

**Tech Stack:** NestJS 11 (hexagonal, no service classes), Prisma + hand-written SQL migrations, Postgres RLS, BullMQ, React Router 8 SSR, shadcn/ui, zod contracts.

**Spec:** [`docs/superpowers/specs/2026-08-14-in-app-notification-center-design.md`](../specs/2026-08-14-in-app-notification-center-design.md)

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from `AGENTS.md`.

- **NO TESTS, EVER.** Never create `*.spec.*` / `*.test.*` / e2e files, vitest/jest/playwright config, `test` scripts, or CI test steps. This overrides the TDD steps any skill would normally insert. Verification is `typecheck` + `lint` + `build` + running the app. See ADR 0005.
- **Backend flow is `controller → use-case → repository-port → repository`.** No service classes in the application layer.
- **One use-case = one file:** exactly one exported `@Injectable XxxUseCase` with a single public `execute()`.
- **All tenant data flows through `TenantDbService.forTenant(tenantId, tx => …)`** — one interactive transaction per business operation. Never nest `forTenant`, never call it per query. Repositories receive the `tx`, never the raw client.
- **Every tenant-scoped table needs `tenant_id uuid NOT NULL` + a hand-written RLS migration** (FORCE RLS + `tenant_isolation` policy). Migrations are hand-authored, never `prisma migrate dev`. See ADR 0004.
- **Every protected endpoint declares `@RequirePermissions(...)`, `@Public()`, or `@AuthenticatedOnly()`.** The global guard is deny-by-default.
- **Time is `timestamptz` UTC.** Use `apps/api/src/shared/time`.
- **Dashboard UI is Vietnamese-hardcoded.** Style with semantic tokens only — a literal hex in app code is a defect.
- **Frontends never fetch the backend from the browser.** All data goes through RR `loader`/`action`.
- **Route URLs come from `~/constants/paths`; backend endpoints from `~/constants/api-paths`.** Never hand-build either, never append a query string by hand — pass `{ query }`.
- **Node ≥ 22.22.0 and pnpm 10.13.1.** Use pnpm only. If a frontend command fails instantly, run `nvm use`.

**Verification command used throughout this plan** (referred to as *the static gate*):

```bash
pnpm check:no-tests && pnpm check:module-cycles && pnpm check:frontend-structure \
  && pnpm check:theme-tokens && pnpm --filter=@booking/storefront security \
  && pnpm turbo lint typecheck build && pnpm --filter=@booking/api check:rls
```

Early backend-only tasks may run the faster `pnpm --filter=@booking/api typecheck` while iterating, but **every task's commit step runs the full static gate.**

---

## File Structure

**Created — backend**

| File | Responsibility |
| --- | --- |
| `packages/contracts/src/contracts/notification.ts` | zod schemas + inferred types shared FE↔BE |
| `apps/api/prisma/migrations/20260814000000_notifications/migration.sql` | table, enum, indexes, RLS, grants |
| `apps/api/src/modules/notification/domain/notification-area.ts` | `NotificationArea`, `NotificationTargetType` re-exports + `InboxRow` |
| `apps/api/src/modules/notification/domain/in-app-templates.ts` | `IN_APP_TEMPLATES` — the gate + copy for path 1 |
| `apps/api/src/modules/notification/domain/tenant-notification-plan.ts` | event → `{permission, title, targetType, targetIdKey, subjectKind}` for path 2 |
| `apps/api/src/modules/notification/domain/ports/notification-inbox-repository.port.ts` | the inbox port |
| `apps/api/src/modules/notification/application/inbox-collector.ts` | in-memory row accumulator (no I/O) |
| `apps/api/src/modules/notification/application/use-cases/dispatch-tenant-event.use-case.ts` | path 2 dispatcher |
| `apps/api/src/modules/notification/application/use-cases/list-notifications.use-case.ts` | feed |
| `apps/api/src/modules/notification/application/use-cases/count-unread-notifications.use-case.ts` | the 60s poll |
| `apps/api/src/modules/notification/application/use-cases/mark-notification-read.use-case.ts` | one row |
| `apps/api/src/modules/notification/application/use-cases/mark-all-notifications-read.use-case.ts` | whole area |
| `apps/api/src/modules/notification/infrastructure/repositories/prisma-notification-inbox.repository.ts` | inbox adapter |
| `apps/api/src/modules/notification/infrastructure/http/notification.controller.ts` | the module's first controller |
| `apps/api/src/modules/notification/infrastructure/http/dto/notification.dto.ts` | `createZodDto` wrappers |
| `apps/api/src/modules/notification/infrastructure/http/guards/resolve-notification-tenant-context.guard.ts` | seeds `TenantContextService` on `@AuthenticatedOnly` routes |
| `apps/api/src/modules/notification/infrastructure/notification-retention.worker.ts` | 90-day prune |

**Modified — backend**

| File | Change |
| --- | --- |
| `apps/api/prisma/schema.prisma` | `Notification` model + `NotificationArea` enum |
| `apps/api/src/modules/notification/domain/entities/notification-delivery.entity.ts` | three getters |
| `apps/api/src/modules/notification/application/deliver-notification.ts` | collect the inbox row before the dedupe gate |
| `apps/api/src/modules/notification/domain/ports/notification-reader.port.ts` | 3 new methods |
| `apps/api/src/modules/notification/infrastructure/prisma-notification.reader.ts` | their implementations |
| 6 dispatch use-cases | pass the collector, flush once |
| `apps/api/src/modules/notification/infrastructure/http/notification.module.ts` | providers, controller, path-2 registration |
| `packages/contracts/src/index.ts` | export the new contract file |

**Created — dashboard**

| File | Responsibility |
| --- | --- |
| `apps/dashboard/app/features/notifications/server/notifications.server.ts` | loader/action data functions |
| `apps/dashboard/app/features/notifications/lib/notification-target.ts` | the ONLY target → URL mapping |
| `apps/dashboard/app/features/notifications/lib/notification-area.ts` | pathname → area |
| `apps/dashboard/app/features/notifications/components/notification-bell.tsx` | popover + badge + poll |
| `apps/dashboard/app/features/notifications/components/notification-list.tsx` | shared row rendering |
| `apps/dashboard/app/routes/notifications.tsx` | resource route (loader + action) |
| `apps/dashboard/app/routes/tenant/notifications/_index.tsx` | full list, tenant |
| `apps/dashboard/app/routes/partner/notifications/_index.tsx` | full list, partner |

**Modified — dashboard**

| File | Change |
| --- | --- |
| `apps/dashboard/app/components/dashboard-header.tsx:86-88` | render `<NotificationBell />` |
| `apps/dashboard/app/constants/paths.ts` | `tenant.notifications`, `partner.notifications` |
| `apps/dashboard/app/constants/api-paths.ts` | `notifications.*` |
| `apps/dashboard/app/routes.ts` | register `notifications` resource route |
| `apps/dashboard/app/routes/tenant/routes.ts` + `nav.ts` | the tenant list screen |
| `apps/dashboard/app/routes/partner/routes.ts` + `nav.ts` | the partner list screen |

---

## Task 1: Contracts

**Files:**
- Create: `packages/contracts/src/contracts/notification.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**
- Consumes: `paginationQuerySchema` from `./common`
- Produces: `notificationAreaSchema`, `NotificationArea`, `notificationTargetTypeSchema`, `NotificationTargetType`, `notificationSchema`, `NotificationResponse`, `notificationsQuerySchema`, `NotificationsQuery`, `notificationListResponseSchema`, `NotificationListResponse`, `unreadCountResponseSchema`, `UnreadCountResponse`, `markAllNotificationsReadInputSchema`, `MarkAllNotificationsReadInput`

- [ ] **Step 1: Create the contract file**

```ts
// packages/contracts/src/contracts/notification.ts
import { z } from 'zod';
import { paginationQuerySchema } from './common';

/** Which bell a row belongs to. Deliberately NOT the email `Audience` type —
 *  a customer has no dashboard, and `admin` is added only when an event
 *  actually addresses the platform console. */
export const notificationAreaSchema = z.enum(['tenant', 'partner', 'affiliate']);
export type NotificationArea = z.infer<typeof notificationAreaSchema>;

/**
 * What a row points at. Stored instead of a URL so a route rename cannot
 * silently 404 every historical notification — the dashboard resolves this to a
 * path through `dashboardPaths` at render time.
 */
export const notificationTargetTypeSchema = z.enum([
  'tenant_partner',
  'tenant_listing_review',
  'tenant_listing_group_review',
  'tenant_disputes',
  'tenant_reviews',
  'tenant_affiliate',
  'partner_booking',
  'partner_listings',
  'partner_revenue',
  'partner_profile',
  'partner_home',
  'affiliate_home',
]);
export type NotificationTargetType = z.infer<typeof notificationTargetTypeSchema>;

export const notificationSchema = z.object({
  id: z.string().uuid(),
  area: notificationAreaSchema,
  eventType: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  targetType: notificationTargetTypeSchema,
  targetId: z.string().uuid().nullable(),
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type NotificationResponse = z.infer<typeof notificationSchema>;

export const notificationsQuerySchema = paginationQuerySchema.extend({
  area: notificationAreaSchema,
});
export type NotificationsQuery = z.infer<typeof notificationsQuerySchema>;

export const notificationListResponseSchema = z.object({
  items: z.array(notificationSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>;

export const unreadCountResponseSchema = z.object({ count: z.number().int().min(0) });
export type UnreadCountResponse = z.infer<typeof unreadCountResponseSchema>;

export const markAllNotificationsReadInputSchema = z.object({ area: notificationAreaSchema });
export type MarkAllNotificationsReadInput = z.infer<typeof markAllNotificationsReadInputSchema>;
```

- [ ] **Step 2: Export it**

Append to `packages/contracts/src/index.ts`, after the `content-report` line:

```ts
export * from './contracts/notification';
```

- [ ] **Step 3: Build the package**

Run: `pnpm --filter=@booking/contracts build`
Expected: success, `dist/` regenerated. `@booking/contracts` builds to `dist`, so downstream typechecks see the new types only after this.

- [ ] **Step 4: Run the static gate and commit**

```bash
pnpm check:no-tests && pnpm check:module-cycles && pnpm check:frontend-structure \
  && pnpm check:theme-tokens && pnpm --filter=@booking/storefront security \
  && pnpm turbo lint typecheck build && pnpm --filter=@booking/api check:rls
git add packages/contracts
git commit -m "feat(contracts): notification inbox schemas"
```

---

## Task 2: Table, RLS migration, Prisma model

**Files:**
- Create: `apps/api/prisma/migrations/20260814000000_notifications/migration.sql`
- Modify: `apps/api/prisma/schema.prisma`

**Interfaces:**
- Produces: Prisma model `Notification` (accessor `prisma.notification`), enum `NotificationArea`

- [ ] **Step 1: Write the migration**

```sql
-- apps/api/prisma/migrations/20260814000000_notifications/migration.sql
CREATE TYPE "notification_area" AS ENUM ('tenant', 'partner', 'affiliate');

CREATE TABLE "notifications" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "area" "notification_area" NOT NULL,
  "event_type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT,
  "target_type" TEXT NOT NULL,
  "target_id" UUID,
  "dedupe_key" TEXT NOT NULL,
  "read_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Idempotency for an at-least-once outbox. With this index the write is
-- INSERT … ON CONFLICT DO NOTHING and needs no read-before-write, unlike the
-- email channel's deliberately racy `alreadySent` count.
CREATE UNIQUE INDEX "notifications_user_id_dedupe_key_key"
  ON "notifications"("user_id", "dedupe_key");

-- The feed.
CREATE INDEX "notifications_feed_idx"
  ON "notifications"("user_id", "tenant_id", "area", "created_at" DESC);

-- The unread count. This is the most frequently executed query in the feature
-- (every open dashboard, every 60s) and gets its own partial index.
CREATE INDEX "notifications_unread_idx"
  ON "notifications"("user_id", "tenant_id", "area")
  WHERE "read_at" IS NULL;

-- Retention sweep predicate.
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "notifications"
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "notifications" TO app_user, app_admin;
```

- [ ] **Step 2: Add the Prisma model**

Add the enum next to `NotificationStatus` (`schema.prisma:604`):

```prisma
enum NotificationArea {
  tenant
  partner
  affiliate

  @@map("notification_area")
}
```

Add the model next to `NotificationLog` (`schema.prisma:2532`):

```prisma
/// In-app notification inbox. RLS isolates TENANTS, not users: inside one
/// tenant an app_user session can read every row. Per-user isolation lives
/// entirely in the repository's `WHERE user_id = $me` — never remove it.
model Notification {
  id         String           @id @default(uuid(7)) @db.Uuid
  tenantId   String           @map("tenant_id") @db.Uuid
  userId     String           @map("user_id") @db.Uuid
  area       NotificationArea
  eventType  String           @map("event_type")
  title      String
  body       String?
  targetType String           @map("target_type")
  targetId   String?          @map("target_id") @db.Uuid
  dedupeKey  String           @map("dedupe_key")
  readAt     DateTime?        @map("read_at") @db.Timestamptz(6)
  createdAt  DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)

  @@unique([userId, dedupeKey])
  @@index([userId, tenantId, area, createdAt(sort: Desc)])
  @@index([createdAt])
  @@map("notifications")
}
```

Note the partial unread index is **not** expressible in Prisma and lives only in the migration — that is expected and matches how other partial indexes in this schema are handled.

- [ ] **Step 3: Apply and regenerate**

```bash
docker compose up -d
pnpm --filter=@booking/api prisma:deploy
pnpm --filter=@booking/api prisma:generate
```

Expected: migration applies cleanly; `prisma.notification` exists on the generated client.

- [ ] **Step 4: Verify RLS coverage**

Run: `pnpm --filter=@booking/api check:rls`
Expected: exit 0. The script parses `tenant_id` out of `schema.prisma` and requires both `FORCE ROW LEVEL SECURITY` and `CREATE POLICY … ON notifications` somewhere in `prisma/migrations/` — both are in Step 1.

- [ ] **Step 5: Run the static gate and commit**

```bash
git add apps/api/prisma
git commit -m "feat(api): notifications table with RLS and inbox indexes"
```

---

## Task 3: Domain — targets, in-app template map, tenant plan, inbox port

**Files:**
- Create: `apps/api/src/modules/notification/domain/notification-area.ts`
- Create: `apps/api/src/modules/notification/domain/in-app-templates.ts`
- Create: `apps/api/src/modules/notification/domain/tenant-notification-plan.ts`
- Create: `apps/api/src/modules/notification/domain/ports/notification-inbox-repository.port.ts`

**Interfaces:**
- Consumes: `NotificationArea`, `NotificationTargetType` from `@booking/contracts` (Task 1); `NotificationTemplateId` from `../notification-plan`
- Produces: `InboxRow`, `IN_APP_TEMPLATES`, `TENANT_NOTIFICATION_PLAN`, `TENANT_NOTIFICATION_EVENTS`, `NOTIFICATION_INBOX_REPOSITORY`, `INotificationInboxRepository`, `InboxFeedQuery`, `InboxRowRecord`

- [ ] **Step 1: Row shape**

```ts
// apps/api/src/modules/notification/domain/notification-area.ts
import type { NotificationArea, NotificationTargetType } from '@booking/contracts';

export type { NotificationArea, NotificationTargetType };

/** One inbox row to be written. Framework-free — no Nest, no Prisma. */
export interface InboxRow {
  tenantId: string;
  userId: string;
  area: NotificationArea;
  eventType: string;
  title: string;
  body: string | null;
  targetType: NotificationTargetType;
  targetId: string | null;
  dedupeKey: string;
}
```

- [ ] **Step 2: The path-1 gate + copy**

```ts
// apps/api/src/modules/notification/domain/in-app-templates.ts
import type { NotificationTemplateId } from './notification-plan';
import type { NotificationArea, NotificationTargetType } from './notification-area';

export interface InAppTemplate {
  area: NotificationArea;
  title: string;
  targetType: NotificationTargetType;
  /** `'booking'` takes the delivery's bookingId; `null` targets a list screen. */
  targetId: 'booking' | null;
}

/**
 * Which email templates ALSO produce a bell row, and what that row says.
 *
 * ⚠️ ABSENCE IS A DECISION, NOT AN OVERSIGHT. Every `*_customer` template is
 * absent because customers never open the dashboard; both OTP templates are
 * absent because an OTP is not news; `tenant_member_invited` is absent because
 * its recipient may not have an account yet. When adding an email template,
 * decide deliberately whether it belongs here.
 *
 * Titles are written for a BELL, not an inbox — short, no booking-code
 * ceremony, no "Kính gửi".
 */
export const IN_APP_TEMPLATES: Partial<Record<NotificationTemplateId, InAppTemplate>> = {
  booking_pending_approval_partner: {
    area: 'partner', title: 'Lượt đặt mới chờ duyệt',
    targetType: 'partner_booking', targetId: 'booking',
  },
  booking_confirmed_partner: {
    area: 'partner', title: 'Lượt đặt đã xác nhận',
    targetType: 'partner_booking', targetId: 'booking',
  },
  booking_cancelled_partner: {
    area: 'partner', title: 'Lượt đặt đã huỷ',
    targetType: 'partner_booking', targetId: 'booking',
  },
  booking_refunded_partner: {
    area: 'partner', title: 'Lượt đặt đã hoàn tiền',
    targetType: 'partner_booking', targetId: 'booking',
  },
  booking_auto_completed_partner: {
    area: 'partner', title: 'Lượt đặt được tự động hoàn tất',
    targetType: 'partner_booking', targetId: 'booking',
  },
  listing_published_partner: {
    area: 'partner', title: 'Tin đăng đã được duyệt',
    targetType: 'partner_listings', targetId: null,
  },
  listing_hidden_partner: {
    area: 'partner', title: 'Tin đăng đã bị ẩn',
    targetType: 'partner_listings', targetId: null,
  },
  listing_change_approved_partner: {
    area: 'partner', title: 'Chỉnh sửa tin đã được duyệt',
    targetType: 'partner_listings', targetId: null,
  },
  listing_change_rejected_partner: {
    area: 'partner', title: 'Chỉnh sửa tin bị từ chối',
    targetType: 'partner_listings', targetId: null,
  },
  partner_application_received: {
    area: 'partner', title: 'Đã nhận đơn đăng ký đối tác',
    targetType: 'partner_profile', targetId: null,
  },
  partner_approved: {
    area: 'partner', title: 'Tài khoản đối tác đã được duyệt',
    targetType: 'partner_profile', targetId: null,
  },
  partner_agreement_recorded: {
    area: 'partner', title: 'Đã ghi nhận điều khoản hợp tác',
    targetType: 'partner_profile', targetId: null,
  },
  payout_paid_partner: {
    area: 'partner', title: 'Đã chi trả đối soát',
    targetType: 'partner_revenue', targetId: null,
  },
  tax_certificate_issued_partner: {
    area: 'partner', title: 'Đã cấp chứng từ khấu trừ thuế',
    targetType: 'partner_revenue', targetId: null,
  },
  tax_certificate_voided_partner: {
    area: 'partner', title: 'Chứng từ khấu trừ thuế đã bị huỷ',
    targetType: 'partner_revenue', targetId: null,
  },
  legal_document_published_partner: {
    area: 'partner', title: 'Điều khoản đối tác có phiên bản mới',
    targetType: 'partner_home', targetId: null,
  },
  legal_document_published_affiliate: {
    area: 'affiliate', title: 'Điều khoản affiliate có phiên bản mới',
    targetType: 'affiliate_home', targetId: null,
  },
};
```

- [ ] **Step 3: The path-2 plan**

```ts
// apps/api/src/modules/notification/domain/tenant-notification-plan.ts
import type { NotificationTargetType } from './notification-area';

/** Which lookup produces the row's `body` — the line saying WHICH thing. */
export type SubjectKind =
  | 'listing_title'
  | 'listing_group_title'
  | 'partner_name'
  | 'booking_code'
  | 'affiliate_user_name';

export interface TenantNotificationPlanItem {
  /** Only staff holding this key in tenant scope receive the row. */
  permission: string;
  title: string;
  targetType: NotificationTargetType;
  /** Which payload key becomes `target_id`; null targets a list screen. */
  targetIdKey: string | null;
  /** Which payload key identifies the subject to look up. */
  subjectIdKey: string;
  subjectKind: SubjectKind;
}

/**
 * Tenant-facing outbox events (§17). These are IN-APP ONLY — no email — so a
 * tenant's staff are not flooded by routine moderation traffic and no new email
 * template has to be designed.
 *
 * Deliberately excluded, so this is not re-litigated per event:
 *   - `booking.created` — one chime per booking is noise; there is a bookings screen.
 *   - `payment.succeeded`, `finance.*`, `refund.*` — machine-to-machine.
 *   - `listing.created` / `listing.updated` — a partner doing partner work.
 *     Only submission for review is the tenant's business.
 */
export const TENANT_NOTIFICATION_PLAN: Record<string, TenantNotificationPlanItem> = {
  'partner.applied': {
    permission: 'tenant.partners.approve',
    title: 'Đơn đăng ký đối tác mới',
    targetType: 'tenant_partner', targetIdKey: 'partnerId',
    subjectIdKey: 'partnerId', subjectKind: 'partner_name',
  },
  'partner.identity_submitted': {
    permission: 'tenant.partners.approve',
    title: 'Đối tác nộp hồ sơ định danh',
    targetType: 'tenant_partner', targetIdKey: 'partnerId',
    subjectIdKey: 'partnerId', subjectKind: 'partner_name',
  },
  'listing.submitted': {
    permission: 'tenant.listings.publish',
    title: 'Tin đăng chờ duyệt',
    targetType: 'tenant_listing_review', targetIdKey: 'listingId',
    subjectIdKey: 'listingId', subjectKind: 'listing_title',
  },
  'listing.revision_submitted': {
    permission: 'tenant.listings.publish',
    title: 'Chỉnh sửa tin chờ duyệt',
    targetType: 'tenant_listing_review', targetIdKey: 'listingId',
    subjectIdKey: 'listingId', subjectKind: 'listing_title',
  },
  'listing_group.revision_submitted': {
    permission: 'tenant.listings.publish',
    title: 'Chỉnh sửa tin nhiều hạng mục chờ duyệt',
    targetType: 'tenant_listing_group_review', targetIdKey: 'listingGroupId',
    subjectIdKey: 'listingGroupId', subjectKind: 'listing_group_title',
  },
  'settlement.dispute_opened': {
    permission: 'tenant.disputes.resolve',
    title: 'Tranh chấp đối soát mới',
    targetType: 'tenant_disputes', targetIdKey: null,
    subjectIdKey: 'bookingId', subjectKind: 'booking_code',
  },
  'settlement.dispute_responded': {
    permission: 'tenant.disputes.resolve',
    title: 'Đối tác đã phản hồi tranh chấp',
    targetType: 'tenant_disputes', targetIdKey: null,
    subjectIdKey: 'bookingId', subjectKind: 'booking_code',
  },
  'review.created': {
    permission: 'tenant.reviews.read',
    title: 'Đánh giá mới',
    targetType: 'tenant_reviews', targetIdKey: null,
    subjectIdKey: 'listingId', subjectKind: 'listing_title',
  },
  'affiliate.applied': {
    permission: 'tenant.affiliates.manage',
    title: 'Đơn đăng ký affiliate mới',
    targetType: 'tenant_affiliate', targetIdKey: 'affiliateId',
    subjectIdKey: 'affiliateId', subjectKind: 'affiliate_user_name',
  },
};

export const TENANT_NOTIFICATION_EVENTS: readonly string[] = Object.keys(TENANT_NOTIFICATION_PLAN);
```

- [ ] **Step 4: The inbox port**

```ts
// apps/api/src/modules/notification/domain/ports/notification-inbox-repository.port.ts
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { RepoPage } from '../../../../shared/pagination/pagination';
import type { InboxRow, NotificationArea } from '../notification-area';

export const NOTIFICATION_INBOX_REPOSITORY = Symbol('NOTIFICATION_INBOX_REPOSITORY');

/** A persisted row, as read back for the feed. */
export interface InboxRowRecord {
  id: string;
  area: NotificationArea;
  eventType: string;
  title: string;
  body: string | null;
  targetType: string;
  targetId: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface InboxFeedQuery {
  userId: string;
  area: NotificationArea;
  page: number;
  pageSize: number;
}

/**
 * ⚠️ SECURITY INVARIANT — RLS on `notifications` isolates TENANTS, not users.
 * Inside one tenant an app_user session can read every row. Every method here
 * therefore takes a `userId` and MUST filter on it, and `markRead` MUST express
 * ownership as an UPDATE predicate rather than reading the row and checking it
 * afterwards. Removing a `user_id` bound turns a tenant-mate into an attacker.
 */
export interface INotificationInboxRepository {
  /** Idempotent bulk insert — ON CONFLICT (user_id, dedupe_key) DO NOTHING. */
  insertMany(tx: PrismaTx, rows: InboxRow[]): Promise<void>;
  list(tx: PrismaTx, query: InboxFeedQuery): Promise<RepoPage<InboxRowRecord>>;
  countUnread(tx: PrismaTx, userId: string, area: NotificationArea): Promise<number>;
  /** Returns false when the row is not this user's — the caller 404s. */
  markRead(tx: PrismaTx, userId: string, id: string, now: Date): Promise<boolean>;
  markAllRead(tx: PrismaTx, userId: string, area: NotificationArea, now: Date): Promise<void>;
  /** Retention sweep — cross-tenant, runs on the admin pool, not this tx. */
  deleteOlderThan(cutoff: Date): Promise<number>;
}
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter=@booking/api typecheck`
Expected: clean. Nothing imports these yet; this step catches import-path and type errors early.

- [ ] **Step 6: Run the static gate and commit**

```bash
git add apps/api/src/modules/notification/domain
git commit -m "feat(api): notification inbox domain — targets, template gate, tenant plan, port"
```

---

## Task 4: Repository + reader additions

**Files:**
- Create: `apps/api/src/modules/notification/infrastructure/repositories/prisma-notification-inbox.repository.ts`
- Modify: `apps/api/src/modules/notification/domain/ports/notification-reader.port.ts`
- Modify: `apps/api/src/modules/notification/infrastructure/prisma-notification.reader.ts`

**Interfaces:**
- Consumes: `INotificationInboxRepository`, `InboxRow`, `InboxRowRecord`, `InboxFeedQuery` (Task 3)
- Produces: `PrismaNotificationInboxRepository`; on `INotificationReader`: `loadTenantStaffWithPermission`, `hasTenantMembership`, `loadNotificationSubject`

- [ ] **Step 1: Implement the inbox repository**

```ts
// apps/api/src/modules/notification/infrastructure/repositories/prisma-notification-inbox.repository.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { RepoPage } from '../../../../shared/pagination/pagination';
import type { InboxRow, NotificationArea } from '../../domain/notification-area';
import type {
  INotificationInboxRepository,
  InboxFeedQuery,
  InboxRowRecord,
} from '../../domain/ports/notification-inbox-repository.port';

interface Row {
  id: string;
  area: NotificationArea;
  event_type: string;
  title: string;
  body: string | null;
  target_type: string;
  target_id: string | null;
  read_at: Date | null;
  created_at: Date;
}

/**
 * ⚠️ RLS on `notifications` isolates TENANTS, not users — see the port's
 * docblock. Every statement below carries `user_id = ${userId}` for exactly
 * that reason. Do not "simplify" one away.
 */
@Injectable()
export class PrismaNotificationInboxRepository implements INotificationInboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  async insertMany(tx: PrismaTx, rows: InboxRow[]): Promise<void> {
    if (rows.length === 0) return;
    // ON CONFLICT DO NOTHING makes an at-least-once outbox redelivery a no-op
    // without a read-before-write. Prisma's createMany cannot express the
    // conflict target, so this is raw SQL.
    const values = rows.map(
      (r) => Prisma.sql`(
        gen_random_uuid(), ${r.tenantId}::uuid, ${r.userId}::uuid, ${r.area}::notification_area,
        ${r.eventType}, ${r.title}, ${r.body}, ${r.targetType}, ${r.targetId}::uuid, ${r.dedupeKey}
      )`,
    );
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO notifications
        (id, tenant_id, user_id, area, event_type, title, body, target_type, target_id, dedupe_key)
      VALUES ${Prisma.join(values, ', ')}
      ON CONFLICT (user_id, dedupe_key) DO NOTHING`);
  }

  async list(tx: PrismaTx, query: InboxFeedQuery): Promise<RepoPage<InboxRowRecord>> {
    const { userId, area, page, pageSize } = query;
    const rows = await tx.$queryRaw<Row[]>(Prisma.sql`
      SELECT id, area, event_type, title, body, target_type, target_id, read_at, created_at
      FROM notifications
      WHERE user_id = ${userId}::uuid AND area = ${area}::notification_area
      ORDER BY created_at DESC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`);
    const totals = await tx.$queryRaw<{ n: bigint }[]>(Prisma.sql`
      SELECT count(*)::bigint AS n FROM notifications
      WHERE user_id = ${userId}::uuid AND area = ${area}::notification_area`);
    return {
      items: rows.map((r) => ({
        id: r.id,
        area: r.area,
        eventType: r.event_type,
        title: r.title,
        body: r.body,
        targetType: r.target_type,
        targetId: r.target_id,
        readAt: r.read_at,
        createdAt: r.created_at,
      })),
      total: Number(totals[0]?.n ?? 0n),
    };
  }

  async countUnread(tx: PrismaTx, userId: string, area: NotificationArea): Promise<number> {
    const rows = await tx.$queryRaw<{ n: bigint }[]>(Prisma.sql`
      SELECT count(*)::bigint AS n FROM notifications
      WHERE user_id = ${userId}::uuid AND area = ${area}::notification_area
        AND read_at IS NULL`);
    return Number(rows[0]?.n ?? 0n);
  }

  async markRead(tx: PrismaTx, userId: string, id: string, now: Date): Promise<boolean> {
    // Ownership is an UPDATE predicate, never a read-then-check: a read-then-check
    // would let one operator mark a tenant-mate's notification read.
    const affected = await tx.$executeRaw(Prisma.sql`
      UPDATE notifications SET read_at = ${now}
      WHERE id = ${id}::uuid AND user_id = ${userId}::uuid AND read_at IS NULL`);
    if (affected > 0) return true;
    // Already-read is success (idempotent), missing/foreign is not.
    const rows = await tx.$queryRaw<{ n: bigint }[]>(Prisma.sql`
      SELECT count(*)::bigint AS n FROM notifications
      WHERE id = ${id}::uuid AND user_id = ${userId}::uuid`);
    return (rows[0]?.n ?? 0n) > 0n;
  }

  async markAllRead(
    tx: PrismaTx, userId: string, area: NotificationArea, now: Date,
  ): Promise<void> {
    await tx.$executeRaw(Prisma.sql`
      UPDATE notifications SET read_at = ${now}
      WHERE user_id = ${userId}::uuid AND area = ${area}::notification_area
        AND read_at IS NULL`);
  }

  async deleteOlderThan(cutoff: Date): Promise<number> {
    // Cross-tenant sweep on the admin pool — there is no single tenant to scope to.
    return this.prisma.admin.$executeRaw(Prisma.sql`
      DELETE FROM notifications WHERE created_at < ${cutoff}`);
  }
}
```

- [ ] **Step 2: Extend the reader port**

Append to the `INotificationReader` interface in `notification-reader.port.ts`:

```ts
  /**
   * Tenant staff holding `permissionKey` in TENANT scope (partner-scoped
   * assignments are excluded by `partner_id IS NULL`). Queried directly against
   * `role_assignments`/`role_permissions`, exactly as `loadActivePartnerRecipients`
   * queries `partners`/`partner_members` directly — so this module never imports
   * identity-access.
   */
  loadTenantStaffWithPermission(
    tx: PrismaTx, tenantId: string, permissionKey: string,
  ): Promise<NotificationRecipient[]>;

  /**
   * Does this user hold ANY membership in this tenant — staff, partner member,
   * or affiliate? Backs `ResolveNotificationTenantContextGuard`, which must not
   * seed RLS from an unverified `x-tenant-id` header. Runs on the admin pool:
   * it is the check that decides which tenant to scope to, so it cannot itself
   * run inside a tenant-scoped transaction.
   */
  hasTenantMembership(userId: string, tenantId: string): Promise<boolean>;

  /**
   * The `body` line for a tenant notification — WHICH listing, WHICH partner.
   * One read per event, not per recipient. Returns null when the subject was
   * deleted between emit and delivery; the row is still written, just without
   * a subject line.
   */
  loadNotificationSubject(
    tx: PrismaTx, kind: SubjectKind, subjectId: string,
  ): Promise<string | null>;
```

Add the import at the top of the port file:

```ts
import type { SubjectKind } from '../tenant-notification-plan';
```

- [ ] **Step 3: Implement them on the reader**

Add to `PrismaNotificationReader`, and add `SubjectKind` to its type imports:

```ts
  async loadTenantStaffWithPermission(
    tx: PrismaTx, tenantId: string, permissionKey: string,
  ): Promise<NotificationRecipient[]> {
    const rows = await tx.$queryRaw<UserRow[]>(Prisma.sql`
      SELECT DISTINCT u.id, u.email, u.full_name, u.locale, u.phone
      FROM role_assignments ra
      JOIN role_permissions rp ON rp.role_id = ra.role_id
      JOIN users u ON u.id = ra.user_id
      WHERE ra.tenant_id = ${tenantId}::uuid
        AND ra.partner_id IS NULL
        AND rp.permission_key = ${permissionKey}
        AND u.status = 'active'`);
    return rows.map((u) => this.toRecipient(u));
  }

  async hasTenantMembership(userId: string, tenantId: string): Promise<boolean> {
    const rows = await this.prisma.admin.$queryRaw<{ ok: boolean }[]>(Prisma.sql`
      SELECT (
        EXISTS (SELECT 1 FROM role_assignments
                WHERE user_id = ${userId}::uuid AND tenant_id = ${tenantId}::uuid)
        OR EXISTS (SELECT 1 FROM partner_members
                   WHERE user_id = ${userId}::uuid AND tenant_id = ${tenantId}::uuid)
        OR EXISTS (SELECT 1 FROM affiliates
                   WHERE user_id = ${userId}::uuid AND tenant_id = ${tenantId}::uuid)
      ) AS ok`);
    return rows[0]?.ok === true;
  }

  async loadNotificationSubject(
    tx: PrismaTx, kind: SubjectKind, subjectId: string,
  ): Promise<string | null> {
    const sql = {
      listing_title: Prisma.sql`SELECT title AS s FROM listings WHERE id = ${subjectId}::uuid`,
      listing_group_title: Prisma.sql`SELECT title AS s FROM listing_groups WHERE id = ${subjectId}::uuid`,
      partner_name: Prisma.sql`SELECT name AS s FROM partners WHERE id = ${subjectId}::uuid`,
      booking_code: Prisma.sql`SELECT code AS s FROM bookings WHERE id = ${subjectId}::uuid`,
      affiliate_user_name: Prisma.sql`
        SELECT u.full_name AS s FROM affiliates a
        JOIN users u ON u.id = a.user_id WHERE a.id = ${subjectId}::uuid`,
    }[kind];
    const rows = await tx.$queryRaw<{ s: string | null }[]>(sql);
    return rows[0]?.s ?? null;
  }
```

> **Corrected 2026-08-14 (Task 4): reality differed from this sketch.** The
> original version of Step 3 above joined `permissions p ON p.id = rp.permission_id`.
> Neither column exists: `permissions.key` is the model's `@id` (there is no
> `permissions.id`), and `role_permissions` FKs to it directly via
> `permission_key` (there is no `role_permissions.permission_id`). So the join
> to `permissions` is unnecessary and has been removed above — the query
> filters `rp.permission_key = ${permissionKey}` directly. The shipped code is
> `PrismaNotificationReader.loadTenantStaffWithPermission` in
> `apps/api/src/modules/notification/infrastructure/prisma-notification.reader.ts`.

- [ ] **Step 4: Confirm the permission table column names**

Run: `rg -n -A 12 "^model Permission |^model RolePermission " apps/api/prisma/schema.prisma`
Expected: confirms `permissions.key` (the model's `@id`, not `permissions.id`) and
`role_permissions.role_id` / `role_permissions.permission_key` (not
`role_permissions.permission_id`) — see the correction above. **If the real column
names differ, fix the SQL in Step 3 to match the schema — the schema wins.**

- [ ] **Step 5: Typecheck, run the static gate, commit**

```bash
pnpm --filter=@booking/api typecheck
git add apps/api/src/modules/notification
git commit -m "feat(api): notification inbox repository and reader lookups"
```

---

## Task 5: Path 1 — mirror every partner/affiliate email into the bell

**Files:**
- Create: `apps/api/src/modules/notification/application/inbox-collector.ts`
- Modify: `apps/api/src/modules/notification/domain/entities/notification-delivery.entity.ts`
- Modify: `apps/api/src/modules/notification/application/deliver-notification.ts`
- Modify: `dispatch-booking-event.use-case.ts`, `dispatch-listing-event.use-case.ts`, `dispatch-partner-event.use-case.ts`, `dispatch-payout-event.use-case.ts`, `dispatch-legal-document-event.use-case.ts`, `dispatch-tax-certificate-event.use-case.ts`

**Interfaces:**
- Consumes: `IN_APP_TEMPLATES`, `InboxRow` (Task 3); `INotificationInboxRepository` (Task 3/4)
- Produces: `InboxCollector` with `add(row)` / `rows()` / `isEmpty()`; `DeliveryPorts.inbox`; `NotificationDelivery.tenantId` / `.userId` / `.eventType` / `.bookingId`

- [ ] **Step 1: The collector**

```ts
// apps/api/src/modules/notification/application/inbox-collector.ts
import type { InboxRow } from '../domain/notification-area';

/**
 * Accumulates inbox rows in memory during a dispatcher's recipient loop. It
 * performs NO I/O on purpose: `deliverNotification` runs outside any business
 * transaction, and the hard rule forbids nesting `forTenant` or calling it per
 * query — so the dispatcher flushes the whole batch once, in one transaction,
 * after its loop finishes.
 */
export class InboxCollector {
  private readonly buffer: InboxRow[] = [];

  add(row: InboxRow): void {
    this.buffer.push(row);
  }

  rows(): InboxRow[] {
    return this.buffer;
  }

  isEmpty(): boolean {
    return this.buffer.length === 0;
  }
}
```

- [ ] **Step 2: Expose what the row needs on the aggregate**

Add to `NotificationDelivery` (after the existing `recipientEmail` getter):

```ts
  get tenantId(): string {
    return this.attempt.tenantId;
  }

  get userId(): string | null {
    return this.attempt.userId;
  }

  get eventType(): string {
    return this.attempt.eventType;
  }

  get bookingId(): string | null {
    return this.attempt.bookingId;
  }
```

- [ ] **Step 3: Collect the row BEFORE the dedupe gate**

In `deliver-notification.ts`, add to the imports:

```ts
import { IN_APP_TEMPLATES } from '../domain/in-app-templates';
import type { InboxCollector } from './inbox-collector';
```

Add `inbox` to `DeliveryPorts`:

```ts
export interface DeliveryPorts {
  email: IEmailSender;
  logs: INotificationLogRepository;
  renderer: IEmailRenderer;
  /** Absent on the synchronous OTP path, which never produces a bell row. */
  inbox?: InboxCollector;
}
```

Then, inside `deliverNotification`, insert this **immediately after** `const { dedupe, onFailure } = delivery.policy;` and **before** the `alreadySent` line:

```ts
  // ⚠️ ORDER IS LOAD-BEARING. This sits BEFORE the dedupe gate below, which
  // returns early. If the row were collected after it, this would happen:
  // first delivery sends the email, the process dies before the flush, the
  // outbox redelivers, `alreadySent` is now true, we return at the gate — and
  // the email arrived while the bell row never existed. Outbox delivery is
  // at-least-once precisely because processes die. The unique index on
  // (user_id, dedupe_key) makes collecting on every redelivery harmless.
  const inApp = IN_APP_TEMPLATES[delivery.templateId];
  if (inApp && ports.inbox && delivery.userId) {
    ports.inbox.add({
      tenantId: delivery.tenantId,
      userId: delivery.userId,
      area: inApp.area,
      eventType: delivery.eventType,
      title: inApp.title,
      body: null,
      targetType: inApp.targetType,
      targetId: inApp.targetId === 'booking' ? delivery.bookingId : null,
      dedupeKey: delivery.dedupeKey,
    });
  }
```

- [ ] **Step 4: Flush once per dispatcher**

Apply the same four edits to each of the six dispatch use-cases listed under **Files**. Using `dispatch-listing-event.use-case.ts` as the worked example:

1. Add imports:

```ts
import { InboxCollector } from '../inbox-collector';
import {
  NOTIFICATION_INBOX_REPOSITORY,
  type INotificationInboxRepository,
} from '../../domain/ports/notification-inbox-repository.port';
```

2. Add the constructor parameter:

```ts
    @Inject(NOTIFICATION_INBOX_REPOSITORY) private readonly inbox: INotificationInboxRepository,
```

3. Create the collector before the recipient loop and pass it to `deliverNotification`:

```ts
    const collector = new InboxCollector();
    // …existing loops…
        await deliverNotification(
          { email: this.email, logs: this.logs, renderer: this.renderer, inbox: collector },
          delivery,
          { locale: recipient.locale, brand: ctx.brand, data },
        );
```

4. Flush after every loop has finished, as the last statement of `execute()`:

```ts
    if (!collector.isEmpty()) {
      await this.tenantDb.forTenant(tenantId, (tx) => this.inbox.insertMany(tx, collector.rows()));
    }
```

**Do NOT touch `send-booking-otp.use-case.ts` or `dispatch-reminder.use-case.ts`** — their templates are absent from `IN_APP_TEMPLATES`, they address customers, and the OTP path deliberately passes no collector.

- [ ] **Step 5: Register the repository provider**

In `notification.module.ts`, add the import and the provider entry:

```ts
import { NOTIFICATION_INBOX_REPOSITORY } from '../../domain/ports/notification-inbox-repository.port';
import { PrismaNotificationInboxRepository } from '../repositories/prisma-notification-inbox.repository';
```

```ts
    { provide: NOTIFICATION_INBOX_REPOSITORY, useClass: PrismaNotificationInboxRepository },
```

- [ ] **Step 6: Typecheck, run the static gate, commit**

```bash
pnpm --filter=@booking/api typecheck
git add apps/api/src/modules/notification
git commit -m "feat(api): mirror partner and affiliate emails into the in-app inbox"
```

---

## Task 6: Path 2 — tenant events

**Files:**
- Create: `apps/api/src/modules/notification/application/use-cases/dispatch-tenant-event.use-case.ts`
- Modify: `apps/api/src/modules/notification/infrastructure/http/notification.module.ts`

**Interfaces:**
- Consumes: `TENANT_NOTIFICATION_PLAN`, `TENANT_NOTIFICATION_EVENTS` (Task 3); `loadTenantStaffWithPermission`, `loadNotificationSubject` (Task 4)
- Produces: `DispatchTenantEventUseCase.execute(tenantId: string, eventType: string, payload: Record<string, unknown>): Promise<void>`

- [ ] **Step 1: Write the dispatcher**

```ts
// apps/api/src/modules/notification/application/use-cases/dispatch-tenant-event.use-case.ts
import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import type { InboxRow } from '../../domain/notification-area';
import { TENANT_NOTIFICATION_PLAN } from '../../domain/tenant-notification-plan';
import {
  NOTIFICATION_READER,
  type INotificationReader,
} from '../../domain/ports/notification-reader.port';
import {
  NOTIFICATION_INBOX_REPOSITORY,
  type INotificationInboxRepository,
} from '../../domain/ports/notification-inbox-repository.port';

/**
 * Tenant-facing outbox events → the tenant bell (in-app only, no email).
 *
 * Fan-out is filtered by permission: only staff holding the plan's key receive
 * a row, so the bell never titles a task whose screen would 403.
 *
 * Idempotent through the unique index on (user_id, dedupe_key). Out-of-order
 * redelivery is harmless because a notification is an append, not a snapshot —
 * unlike handlers writing absolute state, this one needs no `createdAt` guard.
 */
@Injectable()
export class DispatchTenantEventUseCase {
  constructor(
    @Inject(NOTIFICATION_READER) private readonly reader: INotificationReader,
    @Inject(NOTIFICATION_INBOX_REPOSITORY) private readonly inbox: INotificationInboxRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const plan = TENANT_NOTIFICATION_PLAN[eventType];
    if (!plan) return;
    const subjectId = asUuid(payload[plan.subjectIdKey]);
    const targetId = plan.targetIdKey ? asUuid(payload[plan.targetIdKey]) : null;

    // ONE transaction for the whole operation: recipients, the single subject
    // lookup, and the insert. Never nest `forTenant`, never call it per query.
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const recipients = await this.reader.loadTenantStaffWithPermission(
        tx, tenantId, plan.permission,
      );
      if (recipients.length === 0) return;

      // One read per EVENT, not per recipient.
      const body = subjectId
        ? await this.reader.loadNotificationSubject(tx, plan.subjectKind, subjectId)
        : null;

      const rows: InboxRow[] = recipients.map((r) => ({
        tenantId,
        userId: r.userId,
        area: 'tenant',
        eventType,
        title: plan.title,
        body,
        targetType: plan.targetType,
        targetId,
        dedupeKey: `${eventType}:${subjectId ?? 'none'}:${r.userId}`,
      }));
      await this.inbox.insertMany(tx, rows);
    });
  }
}

/** Outbox payloads are `unknown` JSON; accept only a string id. */
function asUuid(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
```

- [ ] **Step 2: Register the events**

In `notification.module.ts`: add the imports, add `DispatchTenantEventUseCase` to `providers`, inject it into the constructor, and add this loop at the end of `onModuleInit()`:

```ts
    for (const eventType of TENANT_NOTIFICATION_EVENTS) {
      this.registry.register(eventType, (event) => {
        const tenantId = this.requireTenantId(event.eventType, event.tenantId);
        if (!tenantId) return Promise.resolve();
        return this.dispatchTenantEvent.execute(
          tenantId,
          event.eventType,
          (event.payload ?? {}) as Record<string, unknown>,
        );
      });
    }
```

Imports to add:

```ts
import { TENANT_NOTIFICATION_EVENTS } from '../../domain/tenant-notification-plan';
import { DispatchTenantEventUseCase } from '../../application/use-cases/dispatch-tenant-event.use-case';
```

- [ ] **Step 3: Confirm no producer needs changing**

Run: `rg -n -B2 "eventType: 'partner.applied'|eventType: 'listing.submitted'|eventType: 'review.created'" apps/api/src`
Expected: every emit already passes `tenantId`. **No producer use-case is modified by this work.** If any emit lacks `tenantId`, that event would be silently skipped by `requireTenantId` (`notification.module.ts:146`) — fix the emit before continuing.

- [ ] **Step 4: Verify no module cycle was introduced**

Run: `pnpm check:module-cycles`
Expected: exit 0. This module reads `role_assignments`/`role_permissions`/`listings`/`partners` in raw SQL rather than importing identity-access, listing or partner, so the module graph is unchanged.

- [ ] **Step 5: Typecheck, run the static gate, commit**

```bash
pnpm --filter=@booking/api typecheck
git add apps/api/src/modules/notification
git commit -m "feat(api): route nine tenant events to the in-app inbox by permission"
```

---

## Task 7: Read API — guard, use-cases, DTOs, controller

**Files:**
- Create: `apps/api/src/modules/notification/infrastructure/http/guards/resolve-notification-tenant-context.guard.ts`
- Create: `apps/api/src/modules/notification/application/use-cases/list-notifications.use-case.ts`
- Create: `apps/api/src/modules/notification/application/use-cases/count-unread-notifications.use-case.ts`
- Create: `apps/api/src/modules/notification/application/use-cases/mark-notification-read.use-case.ts`
- Create: `apps/api/src/modules/notification/application/use-cases/mark-all-notifications-read.use-case.ts`
- Create: `apps/api/src/modules/notification/infrastructure/http/dto/notification.dto.ts`
- Create: `apps/api/src/modules/notification/infrastructure/http/notification.controller.ts`
- Modify: `apps/api/src/modules/notification/infrastructure/http/notification.module.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–4
- Produces: `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/:id/read`, `POST /notifications/read-all`

- [ ] **Step 1: The tenant-context guard**

```ts
// .../http/guards/resolve-notification-tenant-context.guard.ts
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../../../shared/tenant-context/tenant-context.service';
import type { SessionPrincipal } from '../../../../identity-access/domain/ports/session-store.port';
import {
  NOTIFICATION_READER,
  type INotificationReader,
} from '../../../domain/ports/notification-reader.port';

/**
 * Seeds `TenantContextService` for the notification endpoints.
 *
 * `NotificationController` is entirely `@AuthenticatedOnly()` — reading your own
 * inbox needs no permission key. But `PermissionsGuard` RETURNS AT ITS
 * `AUTHENTICATED_ONLY` BRANCH (permissions.guard.ts:35) and never reaches the
 * `setTenantId` on line 52, so without this guard the store is empty and
 * `tenantIdOrThrow()` throws a 500. `ResolveAffiliateTenantContextGuard`
 * documents the same trap for the same reason.
 *
 * The header is verified, never trusted: a caller with no membership in the
 * named tenant is refused rather than having RLS seeded from their claim. This
 * is defence in depth — every repository statement is ALSO bounded by
 * `user_id = $me`, so a forged header would return an empty set anyway. Both
 * hold; neither may be dropped because the other exists.
 */
@Injectable()
export class ResolveNotificationTenantContextGuard implements CanActivate {
  constructor(
    @Inject(NOTIFICATION_READER) private readonly reader: INotificationReader,
    private readonly tenantContext: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    // SessionAuthGuard already denied an unauthenticated caller before this runs.
    const principal: SessionPrincipal | undefined = req.principal;
    if (!principal) return true;

    const tenantId: string | undefined = req.headers['x-tenant-id'];
    if (!tenantId) throw new ForbiddenException('Thiếu ngữ cảnh tenant.');
    if (!(await this.reader.hasTenantMembership(principal.userId, tenantId))) {
      throw new ForbiddenException('Tài khoản không thuộc tenant này.');
    }
    this.tenantContext.setTenantId(tenantId);
    return true;
  }
}
```

- [ ] **Step 2: The four use-cases**

```ts
// list-notifications.use-case.ts
import { Inject, Injectable } from '@nestjs/common';
import type { NotificationsQuery } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import type { RepoPage } from '../../../../shared/pagination/pagination';
import {
  NOTIFICATION_INBOX_REPOSITORY,
  type INotificationInboxRepository,
  type InboxRowRecord,
} from '../../domain/ports/notification-inbox-repository.port';

/** One page of the caller's own inbox for one area. */
@Injectable()
export class ListNotificationsUseCase {
  constructor(
    @Inject(NOTIFICATION_INBOX_REPOSITORY) private readonly inbox: INotificationInboxRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    tenantId: string, userId: string, query: NotificationsQuery,
  ): Promise<RepoPage<InboxRowRecord>> {
    return this.tenantDb.forTenant(tenantId, (tx) =>
      this.inbox.list(tx, {
        userId,
        area: query.area,
        page: query.page,
        pageSize: query.pageSize,
      }),
    );
  }
}
```

```ts
// count-unread-notifications.use-case.ts
import { Inject, Injectable } from '@nestjs/common';
import type { NotificationArea } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  NOTIFICATION_INBOX_REPOSITORY,
  type INotificationInboxRepository,
} from '../../domain/ports/notification-inbox-repository.port';

/** The 60s poll. Hits the partial index only — never pages a feed. */
@Injectable()
export class CountUnreadNotificationsUseCase {
  constructor(
    @Inject(NOTIFICATION_INBOX_REPOSITORY) private readonly inbox: INotificationInboxRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, userId: string, area: NotificationArea): Promise<number> {
    return this.tenantDb.forTenant(tenantId, (tx) => this.inbox.countUnread(tx, userId, area));
  }
}
```

```ts
// mark-notification-read.use-case.ts
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { utcNow } from '../../../../shared/time/time';
import {
  NOTIFICATION_INBOX_REPOSITORY,
  type INotificationInboxRepository,
} from '../../domain/ports/notification-inbox-repository.port';

/** Ownership is enforced as an UPDATE predicate inside the repository. */
@Injectable()
export class MarkNotificationReadUseCase {
  constructor(
    @Inject(NOTIFICATION_INBOX_REPOSITORY) private readonly inbox: INotificationInboxRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, userId: string, id: string): Promise<void> {
    const ok = await this.tenantDb.forTenant(tenantId, (tx) =>
      this.inbox.markRead(tx, userId, id, utcNow()),
    );
    if (!ok) throw new NotFoundException('Không tìm thấy thông báo.');
  }
}
```

```ts
// mark-all-notifications-read.use-case.ts
import { Inject, Injectable } from '@nestjs/common';
import type { NotificationArea } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { utcNow } from '../../../../shared/time/time';
import {
  NOTIFICATION_INBOX_REPOSITORY,
  type INotificationInboxRepository,
} from '../../domain/ports/notification-inbox-repository.port';

@Injectable()
export class MarkAllNotificationsReadUseCase {
  constructor(
    @Inject(NOTIFICATION_INBOX_REPOSITORY) private readonly inbox: INotificationInboxRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, userId: string, area: NotificationArea): Promise<void> {
    return this.tenantDb.forTenant(tenantId, (tx) =>
      this.inbox.markAllRead(tx, userId, area, utcNow()),
    );
  }
}
```

Confirm `utcNow` is exported from `apps/api/src/shared/time/time` — `reminder.worker.ts:4` already imports it from there.

- [ ] **Step 3: DTOs**

```ts
// .../http/dto/notification.dto.ts
import { createZodDto } from 'nestjs-zod';
import {
  markAllNotificationsReadInputSchema,
  notificationListResponseSchema,
  notificationsQuerySchema,
  unreadCountResponseSchema,
} from '@booking/contracts';

export class NotificationsQueryDto extends createZodDto(notificationsQuerySchema) {}
export class MarkAllNotificationsReadDto extends createZodDto(markAllNotificationsReadInputSchema) {}
export class NotificationListResponseDto extends createZodDto(notificationListResponseSchema) {}
export class UnreadCountResponseDto extends createZodDto(unreadCountResponseSchema) {}
```

- [ ] **Step 4: The controller**

```ts
// .../http/notification.controller.ts
import type {
  NotificationListResponse,
  NotificationResponse,
  NotificationTargetType,
  UnreadCountResponse,
} from '@booking/contracts';
import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UuidParam } from '../../../../shared/openapi/decorators';
import { toPaginated } from '../../../../shared/pagination/pagination';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { AuthenticatedOnly } from '../../../identity-access/infrastructure/http/decorators/authenticated-only.decorator';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import { CountUnreadNotificationsUseCase } from '../../application/use-cases/count-unread-notifications.use-case';
import { ListNotificationsUseCase } from '../../application/use-cases/list-notifications.use-case';
import { MarkAllNotificationsReadUseCase } from '../../application/use-cases/mark-all-notifications-read.use-case';
import { MarkNotificationReadUseCase } from '../../application/use-cases/mark-notification-read.use-case';
import type { InboxRowRecord } from '../../domain/ports/notification-inbox-repository.port';
import { ResolveNotificationTenantContextGuard } from './guards/resolve-notification-tenant-context.guard';
import {
  MarkAllNotificationsReadDto,
  NotificationListResponseDto,
  NotificationsQueryDto,
  UnreadCountResponseDto,
} from './dto/notification.dto';

/**
 * The caller's own in-app inbox. `@AuthenticatedOnly` throughout: reading your
 * own mail is not an RBAC question, and inventing a permission key would force
 * a seed run on every environment. The recipient always comes from the session
 * principal, never from a parameter.
 */
@ApiTags('notifications')
@Controller('notifications')
@UseGuards(ResolveNotificationTenantContextGuard)
export class NotificationController {
  constructor(
    private readonly listNotifications: ListNotificationsUseCase,
    private readonly countUnread: CountUnreadNotificationsUseCase,
    private readonly markRead: MarkNotificationReadUseCase,
    private readonly markAllRead: MarkAllNotificationsReadUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @AuthenticatedOnly()
  @Get()
  @ApiOperation({ summary: 'One page of the caller own notifications for an area' })
  @ApiOkResponse({ type: NotificationListResponseDto })
  async list(
    @Query() query: NotificationsQueryDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<NotificationListResponse> {
    const page = await this.listNotifications.execute(
      this.tenantContext.tenantIdOrThrow(),
      principal.userId,
      query,
    );
    return toPaginated(query, page, toNotificationResponse);
  }

  @AuthenticatedOnly()
  @Get('unread-count')
  @ApiOperation({ summary: 'Unread count for one area — the dashboard poll' })
  @ApiOkResponse({ type: UnreadCountResponseDto })
  async unreadCount(
    @Query() query: NotificationsQueryDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<UnreadCountResponse> {
    return {
      count: await this.countUnread.execute(
        this.tenantContext.tenantIdOrThrow(),
        principal.userId,
        query.area,
      ),
    };
  }

  @AuthenticatedOnly()
  @Post(':id/read')
  @UuidParam()
  @HttpCode(204)
  @ApiOperation({ summary: 'Mark one of the caller own notifications read' })
  @ApiNoContentResponse()
  async read(
    @Param('id') id: string,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<void> {
    await this.markRead.execute(this.tenantContext.tenantIdOrThrow(), principal.userId, id);
  }

  @AuthenticatedOnly()
  @Post('read-all')
  @HttpCode(204)
  @ApiOperation({ summary: 'Mark every unread notification in one area read' })
  @ApiNoContentResponse()
  async readAll(
    @Body() input: MarkAllNotificationsReadDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<void> {
    await this.markAllRead.execute(
      this.tenantContext.tenantIdOrThrow(),
      principal.userId,
      input.area,
    );
  }
}

function toNotificationResponse(row: InboxRowRecord): NotificationResponse {
  return {
    id: row.id,
    area: row.area,
    eventType: row.eventType,
    title: row.title,
    body: row.body,
    targetType: row.targetType as NotificationTargetType,
    targetId: row.targetId,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
```

`GET /notifications/unread-count` is declared **after** `GET /` but its literal path cannot collide with it; `POST :id/read` and `POST read-all` differ by method and shape. If Nest ever resolves `unread-count` as an `:id`, move the literal route above the parameterised one.

- [ ] **Step 5: Wire the module**

In `notification.module.ts` add `controllers: [NotificationController]`, add the guard and the four use-cases to `providers`, and import the new symbols.

- [ ] **Step 6: Boot the API and exercise the endpoints**

```bash
pnpm --filter=@booking/api dev
```

Then, in another shell, log in and call the endpoints (replace the tenant id with StudioHub's from the seed):

```bash
curl -si localhost:3000/notifications/unread-count?area=tenant \
  -H "Authorization: Bearer $TOKEN" -H "x-tenant-id: $TENANT_ID"
```

Expected: `200` with `{"count":0}`. Without the `x-tenant-id` header: `403`, **not** a 500 — that is the guard doing its job.

- [ ] **Step 7: Run the static gate and commit**

```bash
git add apps/api/src/modules/notification
git commit -m "feat(api): notification inbox endpoints with their own tenant-context guard"
```

---

## Task 8: Retention worker

**Files:**
- Create: `apps/api/src/modules/notification/infrastructure/notification-retention.worker.ts`
- Modify: `apps/api/src/modules/notification/infrastructure/http/notification.module.ts`

**Interfaces:**
- Consumes: `INotificationInboxRepository.deleteOlderThan` (Task 3/4)
- Produces: `NotificationRetentionWorker`

- [ ] **Step 1: Write the worker**

```ts
// apps/api/src/modules/notification/infrastructure/notification-retention.worker.ts
import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { QUEUE_OPTIONS } from '../../../shared/redis/queue-options';
import { utcNow } from '../../../shared/time/time';
import {
  NOTIFICATION_INBOX_REPOSITORY,
  type INotificationInboxRepository,
} from '../domain/ports/notification-inbox-repository.port';

export const NOTIFICATION_RETENTION_QUEUE = 'notification-retention';
const POLL_EVERY_MS = 24 * 60 * 60_000;
const RETENTION_DAYS = 90;

/**
 * Prunes inbox rows older than 90 days, read or not. Fan-out at write has no
 * natural ceiling — a tenant with 30 staff turns one `listing.submitted` into
 * 30 rows — so without this sweep the table grows forever.
 *
 * Same shape as `reminder.worker.ts`, including its env switches, so a
 * deployment that disables background work disables this too.
 */
@Injectable()
export class NotificationRetentionWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(NotificationRetentionWorker.name);
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(NOTIFICATION_INBOX_REPOSITORY) private readonly inbox: INotificationInboxRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    if (
      process.env.NOTIFICATION_REMINDER_DISABLED === 'true' ||
      process.env.OUTBOX_RELAY_DISABLED === 'true'
    ) {
      return;
    }
    const connection = { url: process.env.REDIS_URL ?? 'redis://localhost:6379' };
    this.queue = new Queue(NOTIFICATION_RETENTION_QUEUE, { connection, ...QUEUE_OPTIONS });
    await this.queue.upsertJobScheduler(
      'notification-retention-sweep',
      { every: POLL_EVERY_MS },
      { name: 'sweep' },
    );
    this.worker = new Worker(NOTIFICATION_RETENTION_QUEUE, () => this.sweep(), { connection });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  private async sweep(): Promise<void> {
    const cutoff = new Date(utcNow().getTime() - RETENTION_DAYS * 24 * 60 * 60_000);
    const deleted = await this.inbox.deleteOlderThan(cutoff);
    if (deleted > 0) this.logger.log(`pruned ${deleted} notifications older than ${RETENTION_DAYS}d`);
  }
}
```

- [ ] **Step 2: Match the shutdown shape to the existing worker**

Run: `sed -n '38,60p' apps/api/src/modules/notification/infrastructure/reminder.worker.ts`
Expected: shows how `onApplicationShutdown` closes the worker and queue. **Mirror whatever it actually does** — if it differs from Step 1, follow the existing file.

- [ ] **Step 3: Register it**

Add `NotificationRetentionWorker` to `providers` in `notification.module.ts`.

- [ ] **Step 4: Typecheck, run the static gate, commit**

```bash
pnpm --filter=@booking/api typecheck
git add apps/api/src/modules/notification
git commit -m "feat(api): prune in-app notifications older than 90 days"
```

---

## Task 9: Dashboard data layer

**Files:**
- Modify: `apps/dashboard/app/constants/api-paths.ts`
- Modify: `apps/dashboard/app/constants/paths.ts`
- Create: `apps/dashboard/app/features/notifications/lib/notification-area.ts`
- Create: `apps/dashboard/app/features/notifications/lib/notification-target.ts`
- Create: `apps/dashboard/app/features/notifications/server/notifications.server.ts`
- Create: `apps/dashboard/app/routes/notifications.tsx`
- Modify: `apps/dashboard/app/routes.ts`

**Interfaces:**
- Consumes: the four endpoints (Task 7); `NotificationResponse`, `NotificationArea`, `NotificationTargetType` (Task 1)
- Produces: `apiPaths.notifications.*`; `dashboardPaths.tenant.notifications`, `dashboardPaths.partner.notifications`; `areaForPathname`; `notificationTargetPath`; `loadNotifications`, `loadUnreadCount`, `markNotificationRead`, `markAllNotificationsRead`; the `/notifications` resource route returning `{ count, items }`

- [ ] **Step 1: Paths**

Add to `apiPaths` in `api-paths.ts`, as a top-level key:

```ts
  /** The caller own in-app inbox (`@AuthenticatedOnly`, tenant scope from the header). */
  notifications: {
    list: '/notifications',
    unreadCount: '/notifications/unread-count',
    read: (id: string) => `/notifications/${segment(id)}/read`,
    readAll: '/notifications/read-all',
  },
```

Add to `dashboardPaths.tenant`: `notifications: tenantPath('/notifications'),`
Add to `dashboardPaths.partner`: `notifications: partnerPath('/notifications'),`

- [ ] **Step 2: Area from the URL**

```ts
// apps/dashboard/app/features/notifications/lib/notification-area.ts
import type { NotificationArea } from '@booking/contracts';

/**
 * Which bell the current screen shows. A user can be tenant staff AND a partner
 * member in the same tenant (a house partner is exactly that), so the bell is
 * scoped by the area you are standing in — otherwise `/partner` would show
 * "đơn đăng ký đối tác mới chờ duyệt".
 *
 * `/admin` returns null: no event addresses the platform console yet, so the
 * shell renders no bell there.
 */
export function areaForPathname(pathname: string): NotificationArea | null {
  if (pathname.startsWith('/tenant')) return 'tenant';
  if (pathname.startsWith('/partner')) return 'partner';
  if (pathname.startsWith('/affiliate')) return 'affiliate';
  return null;
}
```

- [ ] **Step 3: Target → URL, in exactly one place**

```ts
// apps/dashboard/app/features/notifications/lib/notification-target.ts
import type { NotificationTargetType } from '@booking/contracts';
import { dashboardPaths } from '~/constants/paths';

/**
 * The ONLY place a stored target becomes a URL. Rows store `target_type` +
 * `target_id` rather than a path so a route rename cannot silently 404 every
 * notification written in the last 90 days — renaming a route here fixes the
 * history too.
 *
 * An unrecognised type (a row written by a newer API than this deployed
 * dashboard) returns null; the caller renders the item unclickable rather than
 * throwing inside the shell.
 */
export function notificationTargetPath(
  targetType: NotificationTargetType,
  targetId: string | null,
): string | null {
  switch (targetType) {
    case 'tenant_partner':
      return targetId ? dashboardPaths.tenant.partner(targetId) : dashboardPaths.tenant.partners;
    case 'tenant_listing_review':
      return targetId ? dashboardPaths.tenant.listingReview(targetId) : dashboardPaths.tenant.listings;
    case 'tenant_listing_group_review':
      return targetId
        ? dashboardPaths.tenant.listingGroupReview(targetId)
        : dashboardPaths.tenant.listingGroups;
    case 'tenant_disputes':
      return dashboardPaths.tenant.disputes;
    case 'tenant_reviews':
      return dashboardPaths.tenant.reviews;
    case 'tenant_affiliate':
      return targetId ? dashboardPaths.tenant.affiliate(targetId) : dashboardPaths.tenant.affiliates;
    case 'partner_booking':
      return targetId ? dashboardPaths.partner.booking(targetId) : dashboardPaths.partner.bookings;
    case 'partner_listings':
      return dashboardPaths.partner.listings;
    case 'partner_revenue':
      return dashboardPaths.partner.revenue;
    case 'partner_profile':
      return dashboardPaths.partner.profile;
    case 'partner_home':
      return dashboardPaths.partner.home;
    case 'affiliate_home':
      return dashboardPaths.affiliate.home;
    default:
      return null;
  }
}
```

- [ ] **Step 4: Server data functions**

```ts
// apps/dashboard/app/features/notifications/server/notifications.server.ts
import type { NotificationArea, NotificationListResponse, UnreadCountResponse } from '@booking/contracts';
import { apiGet, apiPost, type ApiAuth } from '~/lib/api.server';
import { apiPaths } from '~/constants/api-paths';

export async function loadUnreadCount(
  auth: ApiAuth, area: NotificationArea, signal?: AbortSignal,
): Promise<number> {
  const result = await apiGet<UnreadCountResponse>(apiPaths.notifications.unreadCount, auth, {
    query: { area },
    signal,
  });
  // The bell must never break the shell: a failed poll shows the last known
  // state rather than an error page.
  return result.ok && result.data ? result.data.count : 0;
}

export async function loadNotifications(
  auth: ApiAuth, area: NotificationArea, page: number, pageSize: number, signal?: AbortSignal,
): Promise<NotificationListResponse> {
  const result = await apiGet<NotificationListResponse>(apiPaths.notifications.list, auth, {
    query: { area, page, pageSize },
    signal,
  });
  return result.ok && result.data ? result.data : { items: [], page, pageSize, total: 0 };
}

export async function markNotificationRead(auth: ApiAuth, id: string): Promise<void> {
  await apiPost(apiPaths.notifications.read(id), {}, auth);
}

export async function markAllNotificationsRead(
  auth: ApiAuth, area: NotificationArea,
): Promise<void> {
  await apiPost(apiPaths.notifications.readAll, { area }, auth);
}
```

- [ ] **Step 5: The resource route**

```tsx
// apps/dashboard/app/routes/notifications.tsx
import { notificationAreaSchema } from '@booking/contracts';
import { requireUser } from '~/lib/auth.server';
import { getCurrentDashboardHost } from '~/lib/request-auth.server';
import {
  loadNotifications,
  loadUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from '~/features/notifications/server/notifications.server';
import type { Route } from './+types/notifications';

const POPOVER_PAGE_SIZE = 10;

/**
 * The bell's data, polled every 60s by `NotificationBell`.
 *
 * A resource route rather than the root loader: the root loader runs on every
 * navigation and must stay cheap, and a poll needs its own cadence. The request
 * still goes browser -> RR server -> API, so the httpOnly session cookie is
 * never exposed and `@booking/api-client` stays server-side.
 *
 * Deliberately does NOT use `requireTenant`: a partner-only or affiliate-only
 * user holds no tenant-scope membership and would be 403'd by it, yet they have
 * a bell.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const host = getCurrentDashboardHost();
  const url = new URL(request.url);
  const area = notificationAreaSchema.safeParse(url.searchParams.get('area'));
  if (host.kind !== 'tenant' || !area.success) {
    return Response.json({ count: 0, items: [] });
  }
  const auth = { token: user.accessToken, tenantId: host.tenant.id };
  const [count, page] = await Promise.all([
    loadUnreadCount(auth, area.data, request.signal),
    loadNotifications(auth, area.data, 1, POPOVER_PAGE_SIZE, request.signal),
  ]);
  return Response.json({ count, items: page.items });
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const host = getCurrentDashboardHost();
  if (host.kind !== 'tenant') return Response.json({ ok: false }, { status: 404 });
  const auth = { token: user.accessToken, tenantId: host.tenant.id };
  const form = await request.formData();
  const intent = form.get('intent');
  if (intent === 'read-all') {
    const area = notificationAreaSchema.safeParse(form.get('area'));
    if (area.success) await markAllNotificationsRead(auth, area.data);
  } else if (intent === 'read') {
    const id = form.get('id');
    if (typeof id === 'string' && id) await markNotificationRead(auth, id);
  }
  return Response.json({ ok: true });
}
```

- [ ] **Step 6: Register the route**

In `apps/dashboard/app/routes.ts`, add beside the other top-level resource routes (after the `uploads/presign` line):

```ts
  route('notifications', 'routes/notifications.tsx'),
```

- [ ] **Step 7: Typecheck the dashboard**

```bash
nvm use
pnpm --filter=@booking/dashboard typecheck
```

Expected: clean. This runs `react-router typegen` first, which generates `./+types/notifications` — the route must be registered (Step 6) before this passes.

- [ ] **Step 8: Run the static gate and commit**

```bash
git add apps/dashboard/app
git commit -m "feat(dashboard): notification inbox data layer and resource route"
```

---

## Task 10: The bell

**Files:**
- Create: `apps/dashboard/app/features/notifications/components/notification-list.tsx`
- Create: `apps/dashboard/app/features/notifications/components/notification-bell.tsx`
- Modify: `apps/dashboard/app/components/dashboard-header.tsx`

**Interfaces:**
- Consumes: `/notifications` resource route (Task 9), `areaForPathname`, `notificationTargetPath`
- Produces: `<NotificationList items onRead />`, `<NotificationBell />`

- [ ] **Step 1: The list**

```tsx
// apps/dashboard/app/features/notifications/components/notification-list.tsx
import type { NotificationResponse } from '@booking/contracts';
import { Link } from 'react-router';
import { cn } from '@booking/ui/lib/utils';
import { notificationTargetPath } from '~/features/notifications/lib/notification-target';

interface Props {
  items: NotificationResponse[];
  onRead: (id: string) => void;
}

export function NotificationList({ items, onRead }: Props) {
  if (items.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-muted-foreground">Chưa có thông báo nào.</p>;
  }
  return (
    <ul className="divide-y">
      {items.map((item) => {
        const to = notificationTargetPath(item.targetType, item.targetId);
        const unread = item.readAt === null;
        const body = (
          <div className="flex items-start gap-2 px-4 py-3">
            <span
              aria-hidden
              className={cn('mt-1.5 size-2 shrink-0 rounded-full', unread ? 'bg-primary' : 'bg-transparent')}
            />
            <div className="min-w-0">
              <p className={cn('truncate text-sm', unread ? 'font-semibold' : 'text-muted-foreground')}>
                {item.title}
              </p>
              {item.body ? <p className="truncate text-xs text-muted-foreground">{item.body}</p> : null}
            </div>
          </div>
        );
        return (
          <li key={item.id}>
            {to ? (
              <Link to={to} onClick={() => onRead(item.id)} className="block hover:bg-muted/50">
                {body}
              </Link>
            ) : (
              // Target type this dashboard build does not know — still readable,
              // just not clickable. Never throw inside the shell.
              <div>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
```

Confirm the `cn` import path with `rg -n "from '@booking/ui/lib/utils'" apps/dashboard/app | head -3` and match whatever the codebase already uses.

- [ ] **Step 2: The bell**

```tsx
// apps/dashboard/app/features/notifications/components/notification-bell.tsx
import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useFetcher, useLocation } from 'react-router';
import type { NotificationResponse } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@booking/ui/components/ui/popover';
import { ScrollArea } from '@booking/ui/components/ui/scroll-area';
import { areaForPathname } from '~/features/notifications/lib/notification-area';
import { NotificationList } from './notification-list';

const POLL_MS = 60_000;

interface FeedData {
  count: number;
  items: NotificationResponse[];
}

/**
 * The shell bell. Polls `/notifications` every 60s, and PAUSES while the tab is
 * hidden so a backgrounded dashboard is silent. Data goes browser -> RR server
 * -> API through the resource route, never straight to the backend.
 */
export function NotificationBell() {
  const location = useLocation();
  const area = areaForPathname(location.pathname);
  const feed = useFetcher<FeedData>();
  const action = useFetcher();
  const [open, setOpen] = useState(false);

  const load = feed.load;
  useEffect(() => {
    if (!area) return;
    const url = `/notifications?area=${area}`;
    const tick = () => {
      if (!document.hidden) load(url);
    };
    tick();
    const timer = window.setInterval(tick, POLL_MS);
    // A tab that was hidden for an hour must not show an hour-old badge the
    // moment it is focused again.
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [area, load]);

  if (!area) return null;

  const data = feed.data ?? { count: 0, items: [] };
  const submit = (body: Record<string, string>) =>
    action.submit(body, { method: 'post', action: '/notifications' });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Thông báo">
          <Bell className="size-5" />
          {data.count > 0 ? (
            <Badge
              className="absolute -right-0.5 -top-0.5 h-4 min-w-4 justify-center px-1 text-[10px]"
              aria-label={`${data.count} thông báo chưa đọc`}
            >
              {data.count > 99 ? '99+' : data.count}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <span className="text-sm font-semibold">Thông báo</span>
          {data.count > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => submit({ intent: 'read-all', area })}
            >
              Đánh dấu tất cả đã đọc
            </Button>
          ) : null}
        </div>
        <ScrollArea className="max-h-96">
          <NotificationList
            items={data.items}
            onRead={(id) => {
              setOpen(false);
              submit({ intent: 'read', id });
            }}
          />
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 3: Revalidate after a mark-read**

The bell's badge must drop immediately after "đã đọc". Add this effect below the polling effect:

```ts
  useEffect(() => {
    if (action.state === 'idle' && action.data && area) load(`/notifications?area=${area}`);
  }, [action.state, action.data, area, load]);
```

- [ ] **Step 4: Put it in the header**

In `dashboard-header.tsx`, add the import and render it before `<ModeToggle />` (currently lines 86-88):

```tsx
import { NotificationBell } from '~/features/notifications/components/notification-bell';
```

```tsx
      <div className="ml-auto flex items-center gap-2">
        <NotificationBell />
        <ModeToggle />
      </div>
```

- [ ] **Step 5: Check the shadcn component paths are real**

Run: `ls packages/ui/src/components/ui/{popover,scroll-area,badge,button}.tsx`
Expected: all four exist. Then confirm the import specifier style used elsewhere: `rg -n "@booking/ui/components/ui/popover" apps/dashboard/app | head -3`. If the dashboard imports these differently, match it — and if `Popover` is not yet used anywhere in the dashboard, add it via `/shadcn` into `packages/ui`, never into an app.

- [ ] **Step 6: Verify tokens and structure**

```bash
pnpm check:theme-tokens
pnpm check:frontend-structure
```

Expected: both exit 0. `check:theme-tokens` fails on a literal hex — the components above use semantic tokens only.

- [ ] **Step 7: Run the static gate and commit**

```bash
git add apps/dashboard/app
git commit -m "feat(dashboard): notification bell in the shell header"
```

---

## Task 11: Full list screens

**Files:**
- Create: `apps/dashboard/app/routes/tenant/notifications/_index.tsx`
- Create: `apps/dashboard/app/routes/partner/notifications/_index.tsx`
- Modify: `apps/dashboard/app/routes/tenant/routes.ts`, `apps/dashboard/app/routes/tenant/nav.ts`
- Modify: `apps/dashboard/app/routes/partner/routes.ts`, `apps/dashboard/app/routes/partner/nav.ts`

**Interfaces:**
- Consumes: `loadNotifications`, `markNotificationRead` (Task 9); `NotificationList` (Task 10); `requireTenant` / the partner guard

- [ ] **Step 1: Read the neighbouring screens first**

Run:
```bash
sed -n '1,60p' apps/dashboard/app/routes/tenant/reviews/_index.tsx
cat apps/dashboard/app/routes/tenant/routes.ts
```

Expected: shows this area's loader/guard idiom, its `PaginationBar` usage, and how `routes.ts` registers a nested folder. **Follow that file's shape exactly** rather than the sketch below — each area owns its own conventions.

- [ ] **Step 2: The tenant screen**

`readListParams` (`app/lib/pagination.ts:55`) is this codebase's one pagination reader — it is called **twice**, once in the loader for the API query and once in the component for `pageHref`, exactly as `routes/tenant/finance/disputes.tsx:64,112` does. `PaginationBar` **requires** `hrefFor`; omitting it is a type error.

```tsx
// apps/dashboard/app/routes/tenant/notifications/_index.tsx
import { useFetcher, useSearchParams } from 'react-router';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { loadNotifications } from '~/features/notifications/server/notifications.server';
import { NotificationList } from '~/features/notifications/components/notification-list';
import { PageHeader } from '~/components/page-header';
import { PaginationBar } from '~/components/pagination-bar';
import { readListParams } from '~/lib/pagination';
import type { Route } from './+types/_index';

export async function loader({ request, url }: Route.LoaderArgs) {
  // No permission argument: an inbox is the caller own mail, not an RBAC resource,
  // and every tenant member has one.
  const { auth } = await requireTenant(request);
  const list = readListParams(url.searchParams);
  return loadNotifications(auth, 'tenant', list.page, list.pageSize, request.signal);
}

export default function TenantNotificationsPage({ loaderData }: Route.ComponentProps) {
  const action = useFetcher();
  const [searchParams] = useSearchParams();
  const list = readListParams(searchParams);
  return (
    <div className="space-y-4">
      <PageHeader title="Thông báo" />
      <div className="rounded-lg border">
        <NotificationList
          items={loaderData.items}
          onRead={(id) =>
            action.submit({ intent: 'read', id }, { method: 'post', action: '/notifications' })
          }
        />
      </div>
      <PaginationBar
        page={loaderData.page}
        pageSize={loaderData.pageSize}
        total={loaderData.total}
        hrefFor={list.pageHref}
      />
    </div>
  );
}
```

- [ ] **Step 3: The partner screen**

```tsx
// apps/dashboard/app/routes/partner/notifications/_index.tsx
import { useFetcher, useSearchParams } from 'react-router';
import { requirePartner } from '~/features/partner/server/partner.server';
import { loadNotifications } from '~/features/notifications/server/notifications.server';
import { NotificationList } from '~/features/notifications/components/notification-list';
import { PageHeader } from '~/components/page-header';
import { PaginationBar } from '~/components/pagination-bar';
import { readListParams } from '~/lib/pagination';
import type { Route } from './+types/_index';

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth } = await requirePartner(request);
  const list = readListParams(url.searchParams);
  return loadNotifications(auth, 'partner', list.page, list.pageSize, request.signal);
}

export default function PartnerNotificationsPage({ loaderData }: Route.ComponentProps) {
  const action = useFetcher();
  const [searchParams] = useSearchParams();
  const list = readListParams(searchParams);
  return (
    <div className="space-y-4">
      <PageHeader title="Thông báo" />
      <div className="rounded-lg border">
        <NotificationList
          items={loaderData.items}
          onRead={(id) =>
            action.submit({ intent: 'read', id }, { method: 'post', action: '/notifications' })
          }
        />
      </div>
      <PaginationBar
        page={loaderData.page}
        pageSize={loaderData.pageSize}
        total={loaderData.total}
        hrefFor={list.pageHref}
      />
    </div>
  );
}
```

- [ ] **Step 4: Confirm `requirePartner`'s real signature**

Run: `rg -n -A 12 "export async function requirePartner" apps/dashboard/app/features/partner/server/partner.server.ts`
Expected: it returns an object containing `auth`. **If it takes a required argument or names the field differently, match it** — `requireTenant` takes an optional permission and returns `{ ctx, membership, tenantId, auth, can }` (`tenant.server.ts:41-67`), and `requirePartner` is the sibling of that, but verify rather than assume.

- [ ] **Step 5: Register routes and nav**

In `routes/tenant/routes.ts` add:

```ts
  route('notifications', 'routes/tenant/notifications/_index.tsx'),
```

In `routes/tenant/nav.ts`, add to the overview section (no `permission` key — every member has an inbox):

```ts
      {
        title: 'Thông báo',
        to: dashboardPaths.tenant.notifications,
        icon: Bell,
      },
```

Add `Bell` to the `lucide-react` import. Repeat both for the partner area with `dashboardPaths.partner.notifications`.

- [ ] **Step 6: Typecheck and run the static gate, then commit**

```bash
nvm use
pnpm --filter=@booking/dashboard typecheck
git add apps/dashboard/app
git commit -m "feat(dashboard): full notification list screens for tenant and partner"
```

---

## Task 12: Docs and end-to-end verification

**Files:**
- Modify: `docs/data-model.md`
- Modify: `docs/architecture.md`

- [ ] **Step 1: Document the table**

In `docs/data-model.md`, add `notifications` beside the other tenant-scoped tables. State the three indexes and — most importantly — **the invariant RLS does not enforce**: RLS isolates tenants, not users; per-user isolation is the repository's `WHERE user_id = $me`, and `markRead` expresses ownership as an UPDATE predicate.

- [ ] **Step 2: Document the channel**

In `docs/architecture.md`, in the notifications/outbox section, record that the in-app channel has two producer paths — the email mirror gated by `IN_APP_TEMPLATES`, and the tenant plan routed by permission — and that the in-app row is collected **before** the email dedupe gate, with the reason.

- [ ] **Step 3: Full static gate**

```bash
pnpm check:no-tests && pnpm check:module-cycles && pnpm check:frontend-structure \
  && pnpm check:theme-tokens && pnpm --filter=@booking/storefront security \
  && pnpm turbo lint typecheck build && pnpm --filter=@booking/api check:rls
```

Expected: every command exits 0.

- [ ] **Step 4: Run the app and drive the tenant path**

```bash
docker compose up -d
pnpm --filter=@booking/api prisma:deploy
pnpm dev
```

1. Sign in at `admin.studiohub.localhost:5174` as `giang@giangstudio.vn` / `demo-password`. Submit a listing for review.
2. Sign in as `owner@studiohub.vn` / `demo-password` on the same host. **The bell shows 1 within 60 seconds without a reload.**
3. The item reads "Tin đăng chờ duyệt" with the listing's title beneath it, and clicking it lands on that listing's moderation screen — not a list.
4. Marking it read clears the badge. Reloading keeps it read.

- [ ] **Step 5: Drive the mirrored partner path**

Confirm a booking for a StudioHub listing. Expected: `giang@giangstudio.vn`'s partner bell gains a row, and the customer receives **only** the email — no customer row is written, because every `*_customer` template is absent from `IN_APP_TEMPLATES`.

- [ ] **Step 6: The negative check — this is the one that matters**

Invite a second tenant member **without** `tenant.listings.publish` (use `/tenant/members`, giving them a role lacking that key). Submit another listing as the partner.

Expected: the owner's bell increments; **the second member's bell does not, and their `/tenant/notifications` list does not contain the row at all.** If it does, the permission filter in `loadTenantStaffWithPermission` is wrong — stop and fix it before shipping.

- [ ] **Step 7: Verify idempotency against outbox redelivery**

```bash
docker compose exec -T postgres psql -U postgres -d bookingos \
  -c "SELECT user_id, dedupe_key, count(*) FROM notifications GROUP BY 1,2 HAVING count(*) > 1;"
```

Expected: zero rows. The unique index makes a redelivery a no-op.

- [ ] **Step 8: Commit**

```bash
git add docs
git commit -m "docs: in-app notification channel and the notifications table"
```

---

## Notes for the executor

- **The single most likely bug in this plan** is Step 3 of Task 5 drifting below the dedupe gate during a refactor. If a partner reports "I got the email but nothing in the bell", check that ordering first.
- **`@AuthenticatedOnly()` does not give you a tenant.** If any notification endpoint 500s with a `TenantContextService` error, `ResolveNotificationTenantContextGuard` is not applied to that route.
- **Never add a test file**, even if a step feels like it needs one. Verification is the static gate plus the manual drive in Task 12.
- If a real signature differs from a sketch in this plan (`PaginationBar` props, the partner guard's name, the `cn` import path, the permissions table's column names), **the code wins** — match it and move on.
