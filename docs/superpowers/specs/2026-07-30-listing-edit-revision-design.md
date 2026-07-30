# Listing Edit Revision Design

## Problem

The intended moderation contract is: a partner publishes through tenant review, and a later edit
only reaches customers after the tenant reviews it again. The code does something else, and the two
listing shapes behave in opposite ways.

**Standalone listing — edits publish instantly, with no review.** `UpdateListingUseCase` maps the
patch through `Listing.applyContentUpdate` and never touches `status`
(`apps/api/src/modules/listing/application/use-cases/update-listing.use-case.ts:162`). A `published`
listing therefore serves the new title, photos, price and policy the moment the partner presses save.
The only guard is advisory copy on the edit page — "Đang hiển thị — hãy ẩn tin đăng trước khi sửa nếu
không muốn thay đổi hiện ngay" (`apps/dashboard/app/routes/partner/listings/edit.tsx:39`).

**Grouped listing — edits are blocked outright.** A child of a non-draft group raises
`ListingGroupReadOnlyForEdit` (`update-listing.use-case.ts:101`) and the dashboard loader rejects the
page with 409 before the form renders (`routes/partner/listing-groups/listings.edit.tsx:32`). To fix
a typo in one room, the partner must hide the whole post; editing the archived group then resets the
group *and every child* to `draft` (`update-listing-group.use-case.ts:58-68`), so the entire post
leaves the storefront and must be resubmitted and re-reviewed from scratch.

Three further gaps follow from the same root cause — review is attached to a *status transition*
rather than to *content*:

- **Review bypass.** `transitionRepublish` lets a partner move `archived → published` on their own
  (`domain/moderation/listing-moderation.ts:76`). Publish once, self-hide, rewrite the listing,
  self-unhide: the new content is live and no reviewer ever saw it.
- **Contact-info scan runs once.** `buildListingReview` is only invoked at submit and at publish
  (`publish-listing.use-case.ts:42`), so a phone number or Zalo handle added to the description after
  approval is never scanned. This is the most severe consequence today, because bypassing the
  platform is exactly what the scan exists to prevent.
- **A listing in `pending_review` is still editable in place.** The reviewer approves whatever the row
  holds at click time, which is not necessarily what they read.

`TONG-QUAN.md:500` already anticipates the missing half — "a new post or standalone listing (or a
major edit) goes into `pending_review` … later edits auto-publish (configurable)" — but neither the
major-edit path nor the configuration exists.

The owner's decision for this phase: **every** content edit is reviewed (display content, pricing and
booking mode, location, policy and attributes); the approved version stays live and bookable while a
change waits; and the partner flow must get *simpler* than today, never hiding a post to edit it.

## Design

Keep `listings` and `listing_groups` as the **published** record. Route a partner's edit of an
already-reviewed listing into a separate **revision** row, and apply it to the live record only when
a reviewer approves.

The decisive property of this shape: **the storefront changes nothing**. Every public read path keeps
querying `listings` and can only ever observe approved content, so no query, cache key or SSR loader
has to learn about review state, and unapproved content cannot leak through a path we forgot.

### Data

One table, `listing_revisions`, serving both targets:

| Column | Notes |
| --- | --- |
| `id`, `tenant_id` | `tenant_id` is mandatory — RLS applies like every tenant table |
| `target_type` | `listing` \| `listing_group` |
| `target_id` | the listing or group being edited |
| `payload` (jsonb) | the editable fields, shaped exactly like `updateListingInput` / `updateListingGroupInput` |
| `status` | `pending` \| `approved` \| `rejected` \| `discarded` |
| `submitted_by`, `submitted_at` | partner user + time of the latest save |
| `reviewed_by`, `reviewed_at`, `review_note` | reviewer; the note is required on rejection |
| `applied_at` | when the payload was written onto the live row |

- **At most one `pending` revision per target**, enforced by a partial unique index. Saving again
  overwrites that row instead of queueing a second one, which keeps "what is waiting" unambiguous for
  both sides.
- Migration is hand-authored with `FORCE ROW LEVEL SECURITY` and the `tenant_isolation` policy per
  [ADR 0004](../../decisions/0004-hand-written-migrations.md), then `pnpm --filter=@booking/api check:rls`.
- Terminal revisions are retained, which incidentally gives BookingOS the content-edit history it
  lacks today: `audit_logs` currently records moderation transitions only, never what changed.

### Partner flow

1. The edit page opens for any listing — `published`, `pending_review`, `archived`, and children of a
   live group. Both the domain guard (`ListingGroupReadOnlyForEdit`) and the dashboard 409 go away.
2. The form is seeded from the pending revision when one exists, otherwise from the live record, so
   the partner always continues from their own last edit.
3. Save branches on the listing's status:
   - never reviewed (`draft`) → write straight to the row, exactly as today;
   - anything else → create or update the `pending` revision, which **is** the submission. There is
     no second "Gửi duyệt" step, and no hide-then-resubmit dance. This is the simplification: today's
     grouped-listing path costs five actions and takes the post offline; the new one costs one.
4. The edit page and the listings table show one state chip — *"Đang hiển thị bản đã duyệt · thay đổi
   đang chờ duyệt (gửi 14:20 30/07)"* — with **Huỷ thay đổi**, which discards the revision and returns
   the form to the live content.
5. On rejection the partner sees the reviewer's note and keeps their edited content, so fixing and
   saving again re-arms the same revision.

### Tenant flow

- The existing queues (`/tenant/listings`, `/tenant/listing-groups`) gain a distinction between
  **new posts** and **changes**; both remain one inbox.
- The review page gains a **before/after** block listing only the fields that actually changed,
  grouped the way partners think about them: content & photos · pricing & booking · location ·
  policy & attributes. Photos render as added/removed. The existing per-section cards
  (`features/tenant/components/listing-review/*`) supply the "after" rendering.
- `buildListingReview` runs against **live content with the revision applied**, so the submission
  checklist and the contact-info scan execute on every edit — closing the scan-once hole.
- Approval applies the payload through the existing `UpdateListingUseCase`, which keeps every current
  validation (attribute schema, mode config and package rules, minimum deposit coverage, slug
  collisions, address resolution) and keeps emitting `listing.updated`, whose scheduling handler
  invalidates the availability cache (`modules/scheduling/infrastructure/http/scheduling.module.ts:92`).
  Then `applied_at` is stamped. Rejection requires a note.
- The live record's `status` never moves during any of this: a published listing stays published and
  bookable throughout.
- **Grouped posts are reviewed at post level**, matching §7.3. The group's own revision and its
  children's revisions are approved as one unit, and the reviewer sees the whole post's diff.

### Closing the bypass

- `transitionRepublish` may only publish directly when there is no `pending` revision and the content
  is unchanged since the last approval; otherwise the republish lands in `pending_review`.
- Because a `pending_review` listing is edited through a revision too, a reviewer always approves the
  exact content they read.
- Submit should additionally require `checklistPassed` instead of merely reporting it — a listing with
  zero photos currently reaches the queue (confirmed during the 2026-07-30 QA pass).

### Notifications

Reuse the outbox and `notification-plan.ts`, which already carries `listing_published_partner`. Add
`listing.revision_submitted` → tenant reviewers, and `listing.revision_approved` /
`listing.revision_rejected` → the owning partner, the rejection carrying the note. No new module.

### Safety notes

- **Existing bookings are unaffected by an approval.** Bookings snapshot listing terms at creation
  (`bookings.listing_snapshot`, `pricing_snapshot`, `cancellation_policy_snapshot`), so applying a
  revision cannot retroactively change what a customer already agreed to.
- **A rejected or waiting revision never touches availability**, since the live row is untouched until
  `applied_at`.

### Not in this phase

`TONG-QUAN.md:500` also asks for auto-publishing later edits, *configurable*. Once queue volume
justifies it, a tenant setting `listing_edit_policy = review_all | review_material | auto` is a single
branch at revision-creation time and does not disturb the structure above. Everything ships as
`review_all` first, per the owner's decision.

## Scope

- **DB**: `ListingRevision` model in `apps/api/prisma/schema.prisma` + hand-written RLS migration.
- **Contracts**: `packages/contracts/src/contracts/listing.ts` — revision schema, revision status, and
  the diff response.
- **API**, all inside `apps/api/src/modules/listing/`: new use-cases `submit-listing-revision`,
  `approve-listing-revision`, `reject-listing-revision`, `discard-listing-revision`,
  `get-pending-revision`, plus a revision repository port and its Prisma adapter; edits to
  `update-listing.use-case.ts` (status branch, drop the group block),
  `domain/moderation/listing-moderation.ts` (republish guard), and
  `application/moderation/build-listing-review.ts` (review the merged content).
- **Dashboard, partner**: `routes/partner/listings/edit.tsx`,
  `routes/partner/listing-groups/listings.edit.tsx`, `routes/partner/listing-groups/edit.tsx` (remove
  the 409 gates), the pending-change banner and discard action, and a status chip in
  `features/partner/components/listings/listing-table-columns.tsx`.
- **Dashboard, tenant**: `routes/tenant/listings/review.tsx`,
  `routes/tenant/listing-groups/review.tsx`, and a diff component under
  `features/tenant/components/moderation/`.
- **Storefront**: unchanged.
- **Docs**: update `TONG-QUAN.md` §7.3 and add `docs/decisions/0007-listing-revisions.md`.

No tests, per [ADR 0005](../../decisions/0005-no-tests-policy.md).

## Verification

1. `pnpm check:module-cycles && pnpm turbo lint typecheck build` and
   `pnpm --filter=@booking/api check:rls`.
2. Run the app and drive it as `giang@giangstudio.vn` (partner) and `owner@bookingstudio.vn` (tenant):
   - edit a `published` standalone listing → `bookingstudio.localhost:5173` still shows the old
     content; the tenant queue shows it under changes with an accurate diff; approve → the storefront
     updates.
   - reject with a note → the partner sees the note, edits, saves, and the item returns to the queue.
   - discard → the form returns to live content and the queue empties.
   - edit a room inside a **live** post → no 409, and the post stays visible throughout.
   - add a phone number to an approved listing's description → the revision is flagged by the
     contact scan and cannot be approved without force.
   - self-hide then self-unhide a listing that has a pending revision → the unapproved content does
     not go live.
3. Check the database directly: `listings.updated_at` is unchanged while a revision is `pending`;
   exactly one `pending` row exists per target; after approval `applied_at` is set and the row matches
   the payload.

The `[TEST]` listings and post from the 2026-07-30 QA pass are still present and reusable for these
scenarios. Note that partner Giang Studio is now `verified`, a side effect of testing the identity
gate that Makeup and Model listing types require.
