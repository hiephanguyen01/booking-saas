# Minimalist Studio Pilot

> Status: proposed launch gate  
> Created: 2026-08-03  
> Framework: The Minimalist Entrepreneur — validate by selling, processize before productizing, and build one thing first.

## 1. Current verdict

**Needs more validation.**

The repository already contains a broad platform architecture: multi-tenancy, partners, affiliates, multiple booking modes, commissions, ledger/payouts, promotions, multiple dashboard areas, and future multi-vertical support. That architecture can remain, but it must not define the first commercial release.

Before adding more platform surface area, prove that a specific Vietnamese photo studio will use and pay for one booking workflow.

## 2. The first customer

Start with one precise customer profile:

> An independent photo studio in Vietnam with 2–10 rooms/packages that currently receives bookings through Facebook/Zalo and manages availability manually in chat, a spreadsheet, or a calendar.

Their painful problem is not “needing a marketplace.” It is:

> Staff repeatedly answer availability questions, manually calculate prices/deposits, and risk missing or overlapping bookings across chat channels.

## 3. The one thing the MVP does

> A studio publishes its hourly availability so a customer can choose a slot, submit booking details, pay/record a deposit, and receive confirmation without a long chat conversation.

Everything in the pilot must directly support this sentence.

## 4. Pilot scope

### Must work

1. One pilot tenant representing one real studio.
2. Studio rooms/packages with photos, hourly price, opening hours, and blocked slots.
3. Public storefront: browse → open listing → choose hourly slot.
4. Guest checkout with name, phone, email, note, and booking code.
5. Request-to-book or confirmation flow visible in the tenant dashboard.
6. Deposit instruction/payment status using the simplest reliable SePay or manual bank-transfer flow already supported by the system.
7. Tenant staff can confirm, reject, cancel, and block availability.
8. Minimal customer confirmation/reminder by email; Zalo/manual follow-up is acceptable during the pilot.
9. A simple weekly export or report of inquiries, bookings, deposits, cancellations, and booking value.

### Explicitly deferred from the launch gate

- Homestay, classes, appointments, and other verticals.
- Daily and inventory booking as pilot requirements.
- Open partner marketplace and partner onboarding automation.
- Affiliate system.
- Automated partner/affiliate payouts and full reconciliation UI.
- Advanced promotion engine.
- Full vi/en internationalization.
- Mobile applications.
- Deep template customization and multiple storefront templates.
- Platform-admin polish not required to operate the pilot.
- Scale work without evidence from real pilot usage.

Existing implementation may remain in the codebase. “Deferred” means it must not block the pilot or consume the next development cycle.

## 5. Manual-first process — the magic piece of paper

### Trigger

A studio agrees to a paid 60-day pilot and sends its room/package information.

### Inputs from the studio

- Studio name, address, contact information, logo, and bank details.
- 2–10 rooms/packages, photos, hourly prices, minimum duration, opening hours.
- Existing confirmed bookings for the next 30 days.
- Deposit and cancellation policy.

### Operator steps

1. Create the tenant and one tenant-admin account.
2. Import the studio profile and listings manually.
3. Configure hourly availability and block existing bookings.
4. Review each listing with the studio owner and publish it.
5. Put the booking link in the studio’s Facebook page, Zalo OA/profile, bio, and canned chat reply.
6. When a request arrives, verify the slot against any external calendar/chat bookings.
7. Confirm or reject the request in the dashboard.
8. Verify the deposit/payment status and mark it correctly.
9. Send the customer confirmation and any operational instructions.
10. Record exceptions in a shared pilot log: what required manual work, what confused the studio, and what confused the customer.
11. Review results with the studio once per week.

### Handoff

The customer receives a booking code and confirmation. The studio receives a clear booking record and calendar entry.

### Time target

- Initial studio onboarding: less than 2 hours after data is received.
- Handling one booking exception: less than 10 minutes.
- Normal confirmed booking: no operator intervention beyond payment verification, or less than 3 minutes during the pilot.

## 6. Validation and pricing

### Initial paid offer hypothesis

- **Setup/onboarding:** 990,000 VND once.
- **Pilot subscription:** 490,000 VND/month for 60 days.
- No free pilot. A discount is acceptable only in exchange for weekly feedback and permission to use anonymized results.

Pricing is a hypothesis, not a permanent package. The important signal is that studios pay something before more features are built.

### Validation gate

Do not broaden the MVP until all of these are achieved:

- 10 structured conversations with matching studio owners/managers.
- At least 3 studios agree to pay or place a deposit for the pilot.
- At least 1 pilot studio is live with real public traffic.
- At least 20 real booking requests pass through the system.
- At least 10 become confirmed bookings.
- At least 2 of the first 3 studios choose to continue after the first paid month.

### Questions for every studio interview

1. How do customers ask for available slots today?
2. Where is the final source of truth for the calendar?
3. How often do staff repeat prices, policies, or availability in chat?
4. What booking mistakes happened in the last month?
5. At what step do customers abandon a booking?
6. How are deposits verified and reconciled?
7. What would make the studio refuse to use a booking link?
8. Would the studio pay the proposed setup and monthly fee today?

Record exact examples and transactions, not compliments such as “ý tưởng hay.”

## 7. First-customer plan

### Concentric circle 1 — people already reachable

List 10 studio owners, photographers, makeup artists, or rental operators already known by the founder/team. Ask for a 20-minute workflow review and pitch the paid pilot directly.

### Concentric circle 2 — local community

Build a list of 20 studios actively receiving bookings through Facebook, TikTok, Instagram, or Zalo. Prioritize studios that visibly publish packages but still ask customers to message for availability.

### Personal outreach template

> Chào anh/chị, em thấy studio đang nhận lịch chủ yếu qua inbox và khách cần hỏi lại khung giờ còn trống. Bên em đang chạy thử một trang đặt lịch riêng cho studio: khách xem phòng, chọn giờ và gửi cọc/nhận mã đặt lịch mà không phải hỏi qua nhiều tin nhắn. Em muốn nhập sẵn 2–3 phòng của studio và chạy pilot có phí trong 60 ngày. Em có thể xem quy trình đặt lịch hiện tại của anh/chị trong 20 phút để kiểm tra xem giải pháp này có thật sự giảm việc cho team không?

Personalize the first sentence for every studio. Do not bulk spam.

### Weekly sales target

- 10 personalized contacts.
- 5 workflow interviews.
- 2 live demos using the studio’s own data.
- 1 paid pilot commitment.

Track contacts, pain points, objections, offer, next step, and payment status in one spreadsheet or GitHub issue comment.

## 8. Engineering execution order

The next engineering cycle should be a single end-to-end pilot slice:

1. Seed/configure one realistic studio tenant with 2–3 hourly listings.
2. Verify the existing public catalog and listing detail against that data.
3. Complete one hourly-slot selection path only.
4. Complete guest booking creation and booking-code confirmation.
5. Complete the tenant booking inbox and confirm/reject/cancel actions.
6. Complete the simplest deposit/payment-status path.
7. Add the minimum confirmation notification.
8. Add one end-to-end test for the exact pilot journey.
9. Run the journey with the real pilot studio before improving visual polish.

### Pilot journey acceptance test

Given a published studio room with available hourly slots:

1. A guest opens the tenant domain.
2. The guest chooses a date, start time, and duration.
3. The system shows the final price and deposit requirement.
4. The guest submits contact details and receives a booking code.
5. The tenant sees the request in its dashboard.
6. The tenant confirms the booking and records/verifies the deposit.
7. The slot becomes unavailable to another customer.
8. The guest can reopen the booking using the supported lookup flow.
9. The booking appears in the tenant’s daily operational view.

This journey must pass before work resumes on affiliate, payout automation, additional verticals, or advanced storefront features.

## 9. Product decisions for the pilot

- **Vertical:** photo studios only.
- **Primary booking mode:** hourly only.
- **Checkout:** guest-first.
- **Approval:** request-to-book is acceptable for the first pilot; instant confirmation is not required until calendar accuracy is proven.
- **Payments:** simplest working deposit verification; no new payment abstraction unless required by the pilot.
- **Language:** Vietnamese only for the pilot UI.
- **Theme:** one solid studio template with tenant colors/logo.
- **Support:** founder-assisted onboarding and support are expected.

## 10. Stop/continue decision

After 60 days:

- **Continue/productize:** studios pay, bookings occur, and repeated manual steps are clear. Automate the most time-consuming repeated step first.
- **Needs another pilot:** studios use it but will not pay, or customers start but fail to complete bookings. Fix the offer/workflow before adding features.
- **Pivot:** studios do not perceive availability/chat/deposit handling as painful enough, or refuse to direct customers to a booking link. Revisit the customer segment and problem.
