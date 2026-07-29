# Booking Email Policy Format Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render one timezone-aware cancellation-policy format in every booking email that currently exposes policy content.

**Architecture:** Extract the confirmed-email policy formatter into a pure shared notification-domain module. Feed its structured items and paragraph lines through `bookingTemplateData` to both the specialized customer layouts and the generic booking shell; delete the raw-hours formatter.

**Tech Stack:** TypeScript, NestJS notification domain, React Email, `Intl.DateTimeFormat`, existing VND/time helpers.

## Global Constraints

- Do not add test files, test configuration, migrations, or public API changes.
- Invalid or missing snapshots hide policy content; never show placeholders or raw-hour fallback copy.
- Refunded and non-booking emails do not gain policy sections.
- Verification uses one-off render scripts, Mailpit, lint, typecheck, build, and the repository full static gate.

---

### Task 1: Extract the shared policy presentation

**Files:**
- Create: `apps/api/src/modules/notification/domain/booking-policy-presentation.ts`
- Modify: `apps/api/src/modules/notification/domain/booking-confirmation-presentation.ts`

**Interfaces:**
- Produces: `bookingPolicyPresentation(input): { items: BookingEmailPolicyItem[]; noticeLines: string[]; lines: string[] }`.
- Consumes: frozen policy snapshot, booking start, timezone, locale, paid amount, and deposit amount.

- [ ] **Step 1: Add a one-off failing formatter assertion**

Run `ts-node --transpile-only -e` against the not-yet-created export and assert the standard policy yields the exact three Vietnamese sentences. Expected result: module/export resolution failure.

- [ ] **Step 2: Implement the pure formatter**

Move tier parsing, cutoff calculation, localized policy moment, and fee arithmetic out of the confirmation formatter. Use:

```ts
export interface BookingPolicyPresentationInput {
  snapshot: unknown;
  startUtc: Date;
  timezone: string;
  locale: Locale;
  paidAmount: bigint;
  depositAmount: bigint;
}

export interface BookingPolicyPresentation {
  items: BookingEmailPolicyItem[];
  noticeLines: string[];
  lines: string[];
}
```

`lines` must equal `items.map(item => item.text)` followed by `noticeLines`. A 100% tier is positive; partial tiers are neutral; the final no-refund sentence begins at the last refundable cutoff.

- [ ] **Step 3: Delegate confirmation formatting to the shared module**

Keep confirmation date range and payment formatting in its existing file. Replace its private policy implementation with one call to `bookingPolicyPresentation` and preserve the existing `policyItems`/`policyNoticeLines` output contract.

- [ ] **Step 4: Run the formatter assertion and API typecheck**

Verify vi/en, `168/100 → 48/50 → 0/0`, a `95.000 ₫` retained fee from a `190.000 ₫` deposit, timezone cutoffs, and invalid-snapshot empty output.

### Task 2: Feed the shared format to every booking email renderer

**Files:**
- Modify: `apps/api/src/modules/notification/domain/email-template.ts`
- Modify: `apps/api/src/modules/notification/domain/booking-notification-data.ts`
- Modify: `apps/api/src/modules/notification/infrastructure/email/react-email.renderer.tsx`
- Modify: `apps/api/src/modules/notification/infrastructure/email/booking-customer-email.tsx`

**Interfaces:**
- Add internal `TemplateData.policyLines?: string[]`.
- Remove internal `TemplateData.policyText?: string` after all consumers migrate.

- [ ] **Step 1: Replace the raw policy data path**

Delete `cancellationPolicyText`. Populate `policyLines` from the shared presentation already returned through confirmation data. Supply policy items/notices to confirmed, and use `policyLines` for cancelled/no-show notices. If their snapshot is invalid, retain only the existing state notice; refunded receives no policy lines.

- [ ] **Step 2: Render generic booking policy paragraphs**

Replace the single `policyText` `<Text>` with a yellow policy section that maps `policyLines` to separate paragraphs. Do not change non-booking template data, subjects, recipients, or CTA URLs.

- [ ] **Step 3: Update specialized customer fallback rendering**

Use `policyLines` in `fallbackSnapshot`; confirmed keeps the icon/tone section and final notice, cancelled/no-show render the synchronized lines in their notice area, and refunded remains compact.

- [ ] **Step 4: Prove no raw-hours formatter remains**

Run `rg` for `policyText`, `cancellationPolicyText`, and Vietnamese/English raw-hour cancellation copy under the notification module. Expected result: no matches.

### Task 3: Render, verify, and commit

**Files:**
- Modify only files listed above plus this plan/spec documentation.

- [ ] **Step 1: Render representative templates**

Use one-off scripts to render vi/en confirmed, cancelled, no-show, and `booking_confirmed_partner`. Assert the exact three lines exist as separate HTML/plain-text paragraphs and refunded contains none.

- [ ] **Step 2: Verify Mailpit output**

Send representative customer and partner messages to local Mailpit. Inspect the stored MIME/HTML for cutoff dates, `95.000 ₫`, fee basis, paragraph separation, and absence of `Hủy trước 168 giờ`.

- [ ] **Step 3: Run repository verification**

Run:

```bash
pnpm check:no-tests && pnpm check:module-cycles && pnpm check:frontend-structure && pnpm --filter=@booking/storefront security && pnpm turbo lint typecheck build && pnpm --filter=@booking/api check:rls
```

Expected: all commands exit 0; no test files are added.

- [ ] **Step 4: Review and commit**

Run `git diff --check`, inspect the complete diff, and commit with `feat(notification): unify booking email policy format`.
