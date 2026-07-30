# ADR 0007 — Edits to a reviewed listing are parked as revisions

**Status:** accepted (2026-07-30) · supersedes the "hide the post to edit it" flow

## Context

Moderation was attached to a *status transition*, not to *content*. That produced two opposite
failure modes:

- A **standalone** listing could be edited freely while published, and the edit went live
  immediately — `UpdateListingUseCase` never touched `status`. A partner could publish once, then
  rewrite the title, price, photos and description with nobody reviewing them. The contact-info scan
  (the rule that stops partners from taking bookings off-platform) ran only at submit and publish, so
  a phone number added after approval was never seen.
- A **grouped** listing could not be edited at all: a child of a non-draft group raised
  `LISTING_GROUP_READ_ONLY`, and the only way forward was to hide the whole post — which dragged the
  post and every room back to `draft`, removed them from the storefront, and required a full
  re-review. Fixing one typo cost the partner their visibility.

Un-hiding was a third hole: `transitionRepublish` let a partner move `archived → published`
themselves, including for a listing that had never passed review in the first place.

`TONG-QUAN.md` §7.3 always intended "a new post or standalone listing (**or a major edit**) goes into
`pending_review`", but the major-edit half was never built. The owner's decision for this phase is
stronger and simpler: **every** content edit of an already-reviewed listing is reviewed again, the
approved version stays live while the change waits, and the partner never has to take a listing
offline to change it.

## Decision

`listings` and `listing_groups` hold the **published** record. A partner's edit of anything that has
already been through review is written to `listing_revisions` — one `pending` row per target — and is
copied onto the live record only when a tenant reviewer approves it.

- **Saving is the submission.** There is no second "gửi duyệt" step and no hide-first dance. Saving
  again overwrites the same pending row, so "what is waiting" is never ambiguous.
- **Drafts are unchanged.** A listing nobody has reviewed is still written in place; there is no live
  version to protect.
- **Approval goes through the ordinary update path.** `ApproveListingRevisionUseCase` calls the same
  `ApplyListingUpdateUseCase` a direct edit uses, inside one transaction with the revision's
  settlement, so attribute-schema validation, mode-config/package rules, deposit coverage and slug
  collisions are all re-checked against the listing type *as it exists at approval time*.
- **The review gate now runs on the merged content.** `ReviewListingUseCase` (and the group variant)
  overlay the pending payload before building the checklist and running the contact scan, and
  approval refuses on a contact-info hit unless the reviewer explicitly forces it — the same override
  publishing already had.
- **Posts are reviewed as a unit** (§7.3): approving a post applies its own edit and every waiting
  item edit together.
- **Un-hiding cannot smuggle content past review.** Because the row only ever holds approved content,
  re-publishing an approved listing is safe by construction and needs no extra guard; but a listing
  that was hidden *before* its first approval (`publishedBy === null`) now returns to `pending_review`
  instead of going live.

## Consequences

- The storefront needs **no** changes: every public read path still queries `listings`, so unapproved
  content cannot leak through a query anyone forgot to update. This is the property that made this
  shape preferable to a "draft columns on the row" design.
- Terminal revisions are kept, which gives BookingOS the content-edit history it never had —
  `audit_logs` recorded status transitions only, never what a partner changed.
- Rejections keep the partner's content: the form reopens on their own edit with the reviewer's note
  above it, so fixing and re-saving re-arms the same change.
- `listing_group.reopened` and the archived-group→draft cascade are gone; so is the dashboard's
  "Chuyển về bản nháp" action, which existed only to work around the old read-only rule.
- Reviewer workload rises: every edit is queued. The spec's "later edits auto-publish
  (**configurable**)" remains open as a tenant setting (`review_all | review_material | auto`), a
  single branch at revision-creation time. Shipped as `review_all`.
- Adding a *new* item to a published post is still blocked (`create-listing.use-case.ts`). That is a
  different operation — it creates a row rather than changing one — and needs its own review path.

## Alternatives considered

- **Take the listing offline while the edit waits.** Simplest, no new table, but it costs the partner
  bookings for the duration of a review and repeats the exact pain the old grouped flow caused.
- **Classify "material" vs "minor" fields and auto-publish minor ones.** Closest to the original spec
  line, but the field that leaks contact info (description) would have to count as material anyway,
  and the classification is a policy the owner explicitly did not want yet.
