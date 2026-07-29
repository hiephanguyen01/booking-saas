# Booking Email Policy Format Design

## Goal

Every booking email that displays a cancellation policy must use the same localized,
booking-timezone-aware wording instead of exposing raw `hoursBefore` values.

For the standard `168/100`, `48/50`, `0/0` policy, Vietnamese output is:

- `Hủy miễn phí trước 13:00, ngày 08 tháng 08, 2026`
- `Từ 13:00, ngày 08 tháng 08, 2026 đến trước 13:00, ngày 13 tháng 08, 2026: phí 95.000 ₫ (50% tiền cọc)`
- `Hủy từ 13:00, ngày 13 tháng 08, 2026 hoặc vắng mặt vào ngày thực hiện đơn sẽ không được hoàn tiền.`

English uses the equivalent dates, ranges, fee basis, and no-refund wording.

## Architecture

Extract cancellation-policy parsing and presentation from the confirmation-only
formatter into one pure notification-domain formatter. It accepts the frozen policy
snapshot, booking start, tenant timezone, locale, paid amount, and deposit amount. It
returns structured policy items with semantic tone plus notice lines.

`bookingTemplateData` calls this formatter once and supplies the result to both the
specialized customer booking layouts and the shared booking email shell. There must be
no second raw-hours formatter.

## Rendering

- Confirmed customer keeps its current policy section with icons and final notice box.
- Cancelled and no-show customer emails use the same policy wording in their notice area,
  alongside state-specific notices when applicable.
- Shared booking emails for customer and partner render each policy sentence as a
  separate paragraph in the existing yellow policy box.
- Refunded remains compact and does not gain a policy section.
- Auth, OTP, onboarding, agreement, listing, payout, and other non-booking emails do not
  gain policy content.

## Rules and Failure Handling

- Cutoffs are `startUtc - hoursBefore`, formatted in the booking timezone.
- A 100% tier is the free-cancellation line and uses positive tone.
- A partial-refund tier displays the retained fee calculated from the durable paid amount.
- The fee basis says deposit only when the paid amount is the deposit; otherwise it says
  paid amount.
- The final zero-refund/no-show line starts at the last refundable cutoff.
- Invalid, empty, or non-applicable snapshots hide the policy block completely.
- Missing values never produce placeholders, raw-hour copy, or invented amounts.

## Compatibility and Verification

No public API, event, database, migration, subject, dedupe, or recipient routing changes.
Historical notification logs remain readable.

Verification uses one-off render scripts and Mailpit for vi/en across confirmed,
cancelled, no-show, and a shared partner booking email. It checks the three expected
sentences, fee arithmetic, timezone cutoff, paragraph separation, invalid-snapshot
suppression, and absence of raw `Hủy trước ... giờ` copy. The repository no-tests policy
applies; completion requires the full static gate.
