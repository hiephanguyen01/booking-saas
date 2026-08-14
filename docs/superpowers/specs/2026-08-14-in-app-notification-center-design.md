# In-App Notification Center (tenant + partner bell)

## Goal

Give a tenant operator and a partner a notification bell in the dashboard shell: a persistent,
per-user inbox of what happened, with unread state, that links straight to the screen where the work
is done.

This is the Phase-2 line item sketched in `TONG-QUAN.md:1397` — *"add an in-app adapter to the
existing NotificationPort — writes to a `notifications (user_id, type, title, body, link, read_at)`
table; every event in section 17 automatically gets an in-app version, with no logic duplicated."*

Two different gaps hide behind one request:

- **Partner** already receives 16 templated emails, and affiliate 1, of the 27 declared template ids
  (`notification-plan.ts:9-38`). That half needs a second *channel* for routing that already exists.
- **Tenant staff receive nothing at all.** `Audience` is `'customer' | 'partner' | 'affiliate'`
  (`notification-plan.ts:7`) — there is no tenant audience anywhere in the module. A tenant operator
  finds out a listing needs approval by opening the listing screen and looking. This half is new
  routing, not a new channel.

## Scope

**In:** a `notifications` table with its hand-written RLS migration; an in-app write on the existing
email funnel for partner/affiliate audiences; a new tenant event plan covering 9 outbox events routed
by permission; the notification module's first HTTP controller (4 endpoints); a bell in
`DashboardHeader` with a 60s poll; full list screens at `/tenant/notifications` and
`/partner/notifications`.

**Out:** platform-admin (`/admin`) notifications — no event in the catalog addresses them yet;
customer-facing in-app notifications (customers do not use the dashboard); realtime push (SSE +
Redis pub/sub) — deferred to Phase 2 alongside in-app chat, `tasks/phase-2-marketplace-depth/07-inapp-chat.md`;
per-user notification preferences / mute; email for the 9 new tenant events; new permission keys, so
**no seed run is required**.

## Decisions

| Question | Decision |
| --- | --- |
| Derived counter or a real store | **Real store.** A counter over existing queues (pending listings, open disputes) cannot carry read state, cannot keep history, and cannot represent an event that is not a work queue (`review.created`). |
| Fan-out at write, or filter at read | **Fan-out at write** — one row per recipient, `read_at` on the row. The bell is a read-heavy workload polled every 60s by every open dashboard; filtering at read would put a `role_assignments → role_permissions` join on the hottest query in the feature to save rows on the coldest one. Wrong direction. |
| Who inside a tenant sees what | **By permission.** Each tenant notification names a permission key; only staff holding it get a row. Matches the deny-by-default guard — a bell must never title a task whose screen would 403. |
| Freshness | **Poll ~60s** through a resource route, paused while the tab is hidden. No new infrastructure, and the request still goes browser → RR server → API, so "never fetch the backend from the browser" holds. |
| In-app vs email | Every partner/affiliate email **also** produces a bell row. The 9 new tenant events are **in-app only** — no email — so no new email template has to be designed, and staff inboxes are not flooded by routine moderation traffic. |
| In-app title source | A **static map**, not the rendered email subject. See *The dedupe-ordering trap* — this is a correctness decision, not a copy preference. |
| How a row points at a screen | **`target_type` + `target_id`**, resolved to a URL by the dashboard at render time — not a stored path string. See below. |

## Data model

New Prisma model `Notification` → table `notifications`:

| Column | Type | Note |
| --- | --- | --- |
| `id` | uuid v7 | |
| `tenant_id` | uuid NOT NULL | RLS key |
| `user_id` | uuid NOT NULL | the recipient |
| `area` | `notification_area` | `tenant` \| `partner` \| `affiliate` |
| `event_type` | text | the outbox event that produced it — for pruning and audit |
| `title` | text | Vietnamese, written for a bell |
| `body` | text NULL | the subject line — *which* listing, *which* partner. Null on path 1 |
| `target_type` | text | what the row points at, e.g. `tenant_listing_review` |
| `target_id` | uuid NULL | its id, null for list-screen targets |
| `dedupe_key` | text | path 1 reuses the email delivery's key verbatim (`eventType:aggregateId:templateId:userId`); path 2 uses `eventType:aggregateId:userId` |
| `read_at` | timestamptz NULL | |
| `created_at` | timestamptz | |

Indexes, one per query that exists:

- `UNIQUE (user_id, dedupe_key)` — idempotency. The email channel's `alreadySent` is a `SELECT
  count(*)` with no unique index and is documented as racy on purpose
  (`notification-delivery.entity.ts:20`). The in-app channel does not inherit that: with a real
  unique index, an at-least-once redelivery is `INSERT … ON CONFLICT DO NOTHING` and needs no
  read-before-write.
- `(user_id, tenant_id, area, created_at DESC)` — the feed.
- Partial `(user_id, tenant_id, area) WHERE read_at IS NULL` — the unread count. This is the most
  frequently executed query in the feature; it gets its own index.

The `templateId` segment path 1 inherits is load-bearing, not noise: `partner.approved` plans **two**
templates for the same recipient (`notification-plan.ts:141-145`), and without that segment the two
would collide into one row and the second notification would vanish.

RLS follows `tenant_invitations` (`prisma/migrations/20260813000000_tenant_invitations/migration.sql`)
exactly: `ENABLE` + `FORCE` + a `tenant_isolation` policy with `USING` and `WITH CHECK`, then
`GRANT SELECT, INSERT, UPDATE, DELETE … TO app_user, app_admin`. `check:rls` passes.

### The invariant RLS does not enforce

**RLS isolates tenants, not users.** Inside one tenant, an `app_user` session can read every row of
`notifications`. Row-level user isolation lives entirely in the repository's `WHERE user_id = $me`.

This is the same contract every other table in the codebase has, but it is the first table where two
people *in the same tenant* must not see each other's rows. So:

- Every read method takes `userId` and filters on it. No method returns rows for a tenant.
- `markRead` is `UPDATE … WHERE id = $id AND user_id = $me` — an update predicate, never a
  read-then-check. A read-then-check would let one operator mark another's notification read.
- The port interface and the repository class carry this in a comment.

### Why a target, not a stored URL

A row stores `target_type` + `target_id`; the dashboard turns that pair into a URL at render time
through a single `notificationTargetPath()` helper built on `dashboardPaths`.

`target_type` is `text`, not a Postgres enum — unlike `area`, which is one. `area` is a closed set;
target types grow every time a screen is linked, and an enum would make that a migration. The
contract is enforced in TypeScript at both ends instead, and an unrecognised value degrades to an
unclickable row rather than an error. (`area` is `tenant | partner | affiliate` — `admin` is left out
until an event actually addresses the platform console, so adding it is a deliberate migration.)

Storing the path string instead would work on day one and rot quietly. Rows live 90 days, route
renames do happen in this repo (`docs/superpowers/specs/2026-07-21-packages-listing-rename-design.md`),
and with no tests nothing would catch a stored `/tenant/listings/:id/review` that no longer resolves —
every historical notification would just 404. It would also put dashboard route strings in the API,
against `apps/dashboard/CLAUDE.md`'s rule that route URLs come only from `~/constants/paths`.

The API does already hardcode dashboard paths for **email** CTAs
(`dispatch-listing-event.use-case.ts:54`), so this is not a rule the backend has never bent. The
difference is that an email needs an absolute URL baked in at send time and has no renderer left to
ask; an in-app row is rendered by the dashboard itself, which owns the route table. Different
constraint, different answer.

### Retention

A BullMQ scheduler in `notification-retention.worker.ts`, same shape as `reminder.worker.ts`
(`upsertJobScheduler` + `Worker`, disabled by the same env switches), deletes rows older than 90 days
— read or not. Fan-out has no natural ceiling; without this the table grows forever.

## Event routing

Two paths, deliberately different, because the two gaps are different.

### Path 1 — mirror of the email funnel (partner, affiliate)

`deliverNotification` is already the single funnel every email passes through
(`deliver-notification.ts:27`). One `IN_APP_TEMPLATES` map in `domain/` keyed by
`NotificationTemplateId` decides both *whether* a template reaches the bell and *what it says*:

```ts
interface InAppTemplate {
  area: NotificationArea;
  title: string;
  targetType: NotificationTargetType;
  /** Which id off the delivery becomes `target_id` — null for a list screen. */
  targetId: 'booking' | null;
}
export const IN_APP_TEMPLATES: Partial<Record<NotificationTemplateId, InAppTemplate>>;
```

Presence in the map is the gate. Customer templates and both OTP templates are simply absent, so they
can never produce a bell row. `tenant_member_invited` is absent too — its recipient may not have an
account yet.

`deliverNotification` gains an `inbox` collector in `DeliveryPorts` and four getters on
`NotificationDelivery` (`tenantId`, `userId`, `eventType`, `bookingId`). No other signature changes.

Note `DeliveryAttempt` carries exactly one id — `bookingId` — so booking templates target a booking
detail screen and the rest target a list screen with `targetId: null`. That is not a compromise: the
listing emails already link to `/partner/listings` rather than a listing detail
(`dispatch-listing-event.use-case.ts:54`), so the bell matches what the email has always done.

**One edit, 17 templates reach the bell.** Routing, audience resolution and recipient lists are not
duplicated — only the title string, which is content that has to be written either way.

### The dedupe-ordering trap

The obvious implementation — reuse the rendered `content.subject` as the title, write the row after
the send — is wrong, and it fails silently.

`deliver-notification.ts:33` returns early when `alreadySent(dedupeKey)` is true. So: first delivery
sends the email, then the process dies before the in-app write; the outbox redelivers; `alreadySent`
is now true; the function returns at line 33. **The email arrived and the bell row never exists.**
Outbox delivery is at-least-once precisely because processes die.

Therefore the collector call sits **before** the dedupe gate, and the title comes from the static map
rather than the render. Consequences, all good:

- No render is needed to know the title, so a redelivery does not re-render an email it will not send.
- The two channels dedupe independently: email via the historical racy `alreadySent` (which cannot be
  changed — the key formats are persisted data, `dedupe-key.value-object.ts:6-10`), in-app via a real
  unique index.
- Bell copy is written for a bell. "Đơn đặt chỗ BK-2026-0142 đã được xác nhận" reads as an email
  subject; "Lượt đặt BK-2026-0142 đã xác nhận" reads as a notification.

### Transactions

`deliverNotification` runs **outside** any business transaction, deliberately — a send is not
transactional and a rolled-back `sent` row means a duplicate email (`deliver-notification.ts:24-26`).
The hard rule forbids nested `forTenant` and forbids calling it per query.

So the collector performs **no I/O**: it accumulates rows in memory. Each dispatcher, after its
recipient loop finishes, flushes once inside a single `forTenant`. One added line per dispatcher.

### Path 2 — tenant events (in-app only)

A pure `tenant-notification-plan.ts` in `domain/` maps event type →
`{ permission, title, targetType, targetIdKey, subjectKind }`, and `DispatchTenantEventUseCase`
registers for those types in `NotificationModule.onModuleInit`, following the loop shape already used
for the five existing event groups.

| Event | Payload | Permission to see it | Title | Target → resolves to |
| --- | --- | --- | --- | --- |
| `partner.applied` | `{partnerId, userId}` | `tenant.partners.approve` | Đơn đăng ký đối tác mới | `tenant_partner`/`partnerId` → `tenant.partner(id)` |
| `partner.identity_submitted` | `{partnerId}` | `tenant.partners.approve` | Đối tác nộp hồ sơ định danh | `tenant_partner`/`partnerId` → `tenant.partner(id)` |
| `listing.submitted` | `{listingId}` | `tenant.listings.publish` | Tin đăng chờ duyệt | `tenant_listing_review`/`listingId` → `tenant.listingReview(id)` |
| `listing.revision_submitted` | `{listingId, revisionId}` | `tenant.listings.publish` | Chỉnh sửa tin chờ duyệt | `tenant_listing_review`/`listingId` → `tenant.listingReview(id)` |
| `listing_group.revision_submitted` | `{listingGroupId, revisionId}` | `tenant.listings.publish` | Chỉnh sửa tin nhiều hạng mục chờ duyệt | `tenant_listing_group_review`/`listingGroupId` → `tenant.listingGroupReview(id)` |
| `settlement.dispute_opened` | `{disputeId, settlementId, bookingId}` | `tenant.disputes.resolve` | Tranh chấp đối soát mới | `tenant_disputes`/null → `tenant.disputes` |
| `settlement.dispute_responded` | `{disputeId, bookingId, partnerId}` | `tenant.disputes.resolve` | Đối tác đã phản hồi tranh chấp | `tenant_disputes`/null → `tenant.disputes` |
| `review.created` | `{reviewId, listingId, groupId}` | `tenant.reviews.read` | Đánh giá mới | `tenant_reviews`/null → `tenant.reviews` |
| `affiliate.applied` | `{affiliateId, userId}` | `tenant.affiliates.manage` | Đơn đăng ký affiliate mới | `tenant_affiliate`/`affiliateId` → `tenant.affiliate(id)` |

Every path builder in the right-hand column exists today in `constants/paths.ts:34-74` — including the
two deep links (`listingReview`, `listingGroupReview`) that drop the operator straight onto the
moderation screen rather than a list they then have to search.

Every event type, payload shape, permission key and path builder above was read out of the code, not
assumed. Two consequences worth stating:

- **Every one of these nine emits already carries `tenantId`**, so `requireTenantId`
  (`notification.module.ts:146`) never skips them. **No producer use-case is modified by this work** —
  the whole feature is additive on the consumer side.
- **Payloads carry ids only, never text.** So `title` is a constant per event, and `body` — the line
  that says *which* listing — must be resolved by a lookup. The dispatcher does this with **one read
  per event, not per recipient**, inside the same `forTenant` it already opens to resolve recipients:
  listing title, partner name, or booking code depending on the event. Without it the bell says "Tin
  đăng chờ duyệt" nine times with no way to tell them apart.

Path 1 leaves `body` null — the mirrored email already carries the detail, and its title is specific
enough on its own.

Deliberately excluded, with reasons, so this is not re-litigated per event:

- `booking.created` — one chime per booking turns the bell into noise; the tenant already has a
  bookings screen.
- `payment.succeeded`, `finance.partner_revenue_*`, `refund.*` — machine-to-machine; a human is not
  the consumer.
- `listing.created` / `listing.updated` — a partner doing partner work. Only *submission for review*
  is the tenant's business.

The use-case runs one `forTenant`: resolve recipients, then insert. Out-of-order redelivery
(`outbox.types.ts:7-13`) is harmless here because a notification is an append, not a snapshot — unlike
handlers that write absolute state and need `createdAt` as a monotonic guard.

### Module boundary

Everything lives inside the notification module. To answer "who holds `tenant.listings.publish`", the
reader gains `loadTenantStaffWithPermission(tx, tenantId, permissionKey)` querying `role_assignments`
/ `role_permissions` in raw SQL — the same precedent as `loadActivePartnerRecipients`, which queries
`partners`/`partner_members` directly and documents why: *"so this module never imports it"*
(`prisma-notification.reader.ts:78-80`). No new module edge; `check:module-cycles` is unaffected.

Note `Audience` (email routing) and `NotificationArea` (which bell a row belongs to) stay separate
types. `Audience` gains no `tenant` member — tenant notifications never go through `planForEvent`.

## API

The notification module has no controller today; this adds its first,
`infrastructure/http/notification.controller.ts`. All four endpoints are `@AuthenticatedOnly()` —
reading your own inbox introduces no permission key.

```
GET  /notifications?area=&page=&pageSize=   Paginated<NotificationResponse>
GET  /notifications/unread-count?area=      { count }        ← the 60s poll
POST /notifications/:id/read                204
POST /notifications/read-all                204   body { area }
```

Pagination is **offset** (`page`/`pageSize` → `Paginated<T>`), not cursor: that is what
`paginationQuerySchema` and `shared/pagination` provide and what every other list endpoint in the API
uses (`common.ts:132-143`). A bell reads the newest page and stops; there is no reason to be the one
endpoint with a different pagination style.

The count is a separate endpoint from the feed on purpose: the query that runs every minute for every
open dashboard must hit the partial index alone, not page a feed.

Four use-cases, one file each with a single public `execute()` (hard rule #3): `ListNotifications`,
`CountUnreadNotifications`, `MarkNotificationRead`, `MarkAllNotificationsRead`. Plus
`domain/ports/notification-inbox-repository.port.ts` and its Prisma adapter, returning a `RepoPage`
that the controller wraps with `toPaginated()`.

The recipient comes from `@CurrentPrincipal()` — never from a request parameter.

**The tenant does not arrive for free, and this is the one trap in the API layer.**
`PermissionsGuard` returns at line 35 for an `@AuthenticatedOnly()` route and never reaches the
`setTenantId` on line 52, so `TenantContextService` is empty and `tenantIdOrThrow()` throws a 500. The
affiliate module hit exactly this and documents it at length
(`resolve-affiliate-tenant-context.guard.ts:12-16`).

So the module gets `ResolveNotificationTenantContextGuard`, modelled on that precedent: read
`x-tenant-id`, verify the principal actually holds a membership in that tenant, then seed the context.
Verification is one indexed `EXISTS` over `role_assignments` / `partner_members` / `affiliates` —
covering all three areas that get a bell.

The check is defence in depth rather than the only thing standing between tenants: every statement is
*also* bounded by `user_id = $me`, so a spoofed header would return an empty set rather than another
tenant's rows. Both hold, and neither may be dropped on the grounds that the other exists — the
`user_id` bound is what protects users inside one tenant, and the guard is what keeps a forged header
from ever reaching RLS.

`packages/contracts` gains `packages/contracts/src/contracts/notification.ts` (exported from
`index.ts`) with `notificationAreaSchema`, `notificationTargetTypeSchema`, `notificationSchema`,
`notificationsQuerySchema` (`paginationQuerySchema.extend({ area })`), and
`unreadCountResponseSchema`.

## Frontend

`DashboardHeader` (`dashboard-header.tsx:86-88`) renders `<NotificationBell />` before `<ModeToggle />`.
The header is shared by all four areas, so tenant, partner and affiliate light up from one edit.
`/admin` renders no bell — nothing produces admin rows yet.

New feature `app/features/notifications/{components,server}`, per the mandatory uniform layout:

- `server/notifications.server.ts` — `apiGet`/`apiPost` against `apiPaths.notifications.*`
- `components/notification-bell.tsx` — `Popover` + `Badge` + `ScrollArea` (all present in
  `packages/ui`)
- `components/notification-list.tsx`
- `lib/notification-target.ts` — `notificationTargetPath(targetType, targetId)`, the **only** place
  that maps a stored target to a URL, built on `dashboardPaths`. An unknown `targetType` (a row
  written by a newer API than the deployed dashboard) returns null and the item renders unclickable
  rather than throwing inside the shell.

Data flows through a resource route `app/routes/notifications.tsx` (precedent:
`administrative-provinces.tsx`) driven by `useFetcher`, so the request is browser → RR server → API
and the httpOnly session cookie is never exposed. Poll `setInterval(60_000)` (precedent:
`partner-booking-actions.tsx:64`), **paused while `document.hidden`** so a background tab is silent.

Area is derived from `useLocation().pathname`. Clicking an item navigates via `<Link>` to
`notificationTargetPath(...)` and marks it read. The popover shows the 10 most recent, unread in bold
with a dot, plus "Đánh dấu tất cả đã đọc" and an empty state.

Full list screens at `/tenant/notifications` and `/partner/notifications`, paginated by URL +
loader re-run (no client cache — `@booking/query` was deleted). Cheap, because the API already pages,
and a bell that remembers only 10 rows cannot be used to look anything up.

Affiliate gets the bell but **no list screen**: its entire in-app surface is one template
(`legal_document_published_affiliate`), so an archive would be a page that is almost always empty.
The API is area-agnostic, so adding the screen later is a route file and nothing else.

Route URLs go in `constants/paths.ts`, backend endpoints in `constants/api-paths.ts` — never the
reverse.

## Verification

No tests (ADR 0005). Static gate, the full chain:

```
pnpm check:no-tests && pnpm check:module-cycles && pnpm check:frontend-structure \
  && pnpm check:theme-tokens && pnpm --filter=@booking/storefront security \
  && pnpm turbo lint typecheck build && pnpm --filter=@booking/api check:rls
```

Then run the app and drive it:

1. As `giang@giangstudio.vn`, submit a listing for review.
2. As `owner@bookingstudio.vn` on `admin.bookingstudio.localhost:5174`, the bell shows 1; the item
   links to the moderation screen; marking it read clears the badge.
3. Confirm a booking and check the partner bell receives the mirrored row — and that the customer
   receives only the email.
4. **Negative check:** a tenant staff account without `tenant.listings.publish` must not see the
   listing row at all.

Docs to update: `docs/data-model.md` (the table, its indexes, and the user-isolation invariant),
`docs/architecture.md` (the in-app channel and its two routing paths).

## Risks

- **Write amplification.** A tenant with 30 staff turns one `listing.submitted` into 30 rows. Fine at
  current scale (2 tenants, 161 listings); the 90-day prune is the mitigation. If a tenant ever grows
  past a few hundred staff, revisit — that is when filter-at-read starts to win.
- **Revoked permissions leave history.** A row delivered while the recipient held the permission stays
  in their inbox after it is revoked. Intended: it records what they were told, when. Titles are
  deliberately short and carry no sensitive detail, and the linked screen still enforces its own guard,
  so a stale row cannot leak the underlying record.
- **Title map drift.** A new email template that forgets an `IN_APP_TEMPLATES` entry silently produces
  no bell row. Acceptable because the map is the intended gate (customer templates rely on absence),
  but worth a comment at the map declaring that absence is a decision, not an oversight.
