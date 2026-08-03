# Controlled Studio Pilot Execution Plan

> Status: proposed
> Date: 2026-08-03
> Parent strategy: `docs/minimalist-studio-pilot.md`
> Product reference: Booking SaaS + Multi-Tenant Marketplace — Master Spec V4.0
> Tracking issue: #179

## 1. Purpose

Turn the broad Booking SaaS + Marketplace vision into the smallest controlled commercial pilot that can produce reliable evidence from real studios and real bookings.

The plan follows two rules:

1. Keep the business invariants that protect bookings, tenant data and money.
2. Defer every feature that is not required to prove a studio will use and pay for the core booking workflow.

## 2. Source-of-truth order

When documents conflict, use this order:

1. Accepted ADRs and live code in the repository.
2. This controlled-pilot plan and `docs/minimalist-studio-pilot.md`.
3. The business workflows and domain decisions in Master Spec V4.0.
4. Historical task files and unimplemented technical recommendations.

Important reconciliations:

- The Master Spec describes Next.js applications. The live repository uses React Router framework mode. The pilot does **not** include a frontend-framework migration.
- The Master Spec describes automated unit/E2E quality gates. ADR 0005 in this repository forbids automated tests. The pilot uses the accepted static gates plus recorded runtime smoke against real local/staging infrastructure.
- The Master Spec includes the full external-partner marketplace, settlement and payout chain. The first pilot starts with a **house partner**: the studio sells its own rooms. This removes partner payable/payout from the first commercial proof while preserving the underlying domain model.

## 3. Pilot hypothesis

### Customer

An independent Vietnamese photo studio with 2–10 rooms or hourly packages that currently receives bookings through Facebook/Zalo and maintains availability manually.

### Problem

Studio staff repeatedly answer availability and pricing questions, manually verify deposits and risk conflicting bookings across chat channels.

### Offer

A branded booking link where customers can:

1. view real hourly availability;
2. select a room, time and duration;
3. see the final price and deposit requirement;
4. submit guest details and pay or record a deposit;
5. receive a booking code and confirmation.

The studio can manage the request, payment state and calendar from one operational view.

### Initial price hypothesis

- Setup and assisted onboarding: **990,000 VND once**.
- Controlled pilot: **490,000 VND/month for 60 days**.

No free pilot. A discount is allowed only in exchange for structured weekly feedback and permission to use anonymized results.

## 4. Pilot success definition

The pilot succeeds when all commercial and product gates are met.

### Commercial gate

- 10 matching studios interviewed.
- 3 studios agree to a paid pilot or place a deposit.
- 1 studio runs live public traffic.
- At least 2 of the first 3 studios continue after the first paid month.

### Product gate

- 20 real booking requests enter the system.
- At least 10 become confirmed bookings.
- One booking reaches `completed` without direct database intervention.
- A confirmed slot cannot be booked again.
- The studio can operate normal bookings with less than 3 minutes of manual work per booking, excluding exceptional cases.

### Reliability gate

- Tenant isolation and permissions remain enforced.
- Booking creation is idempotent.
- Availability, hold and database constraints protect the selected slot.
- Payment uncertainty has an explicit reconciliation path.
- Static quality gates pass and runtime-smoke evidence is recorded.

## 5. Launch scope

### Required

- One real tenant and one tenant-admin account.
- One house partner owned by the tenant.
- Two or three published studio room/package listings.
- Hourly booking only.
- Opening hours, blocked periods and the next 30 days of existing bookings.
- Basic weekday/weekend or time-range pricing only where the pilot studio needs it.
- Public listing and hourly availability.
- Quote and deposit amount.
- Guest checkout.
- Booking code and supported booking lookup/recovery flow.
- Simplest reliable payment option already available: Mock in local/staging and PayOS or manual bank-transfer verification for the controlled live pilot.
- Tenant booking inbox and operational status actions.
- Confirmation notification; manual Zalo follow-up is acceptable.
- Audit trail and a shared pilot exception log.
- Weekly operating metrics.

### Deferred until the exit gate passes

- External partner marketplace onboarding.
- Partner payable and payout automation for the first house-partner pilot.
- Affiliate acquisition and affiliate commissions.
- Central marketplace discovery.
- Daily, appointment, class and inventory pilot support.
- Equipment security-deposit workflows.
- Advanced promotions and complex funding allocation.
- Automatic subscription billing.
- Multiple vertical templates.
- Mobile applications.
- Frontend migration to Next.js.
- New automated test infrastructure that conflicts with ADR 0005.

Existing deferred modules may remain in the repository, but they must not block the pilot or consume the next development cycle unless they break the core flow.

## 6. Workstreams

### A. Customer validation and sales

Owner outcome: three paid commitments.

- Build a list of 30 studios; prioritize studios publishing packages but asking customers to message for availability.
- Contact 10 studios per week with personalized outreach.
- Conduct structured 20-minute workflow interviews.
- Demonstrate the product using the studio's own two or three rooms, not generic demo data.
- Record exact objections, current booking volume, deposit method and willingness to pay.
- Ask for payment or pilot deposit during the demo follow-up.

### B. Pilot onboarding and operations

Owner outcome: one studio can be onboarded in less than two hours after complete data is received.

Collect:

- studio identity, address, contacts and brand assets;
- room/package photos and descriptions;
- hourly prices, minimum duration and buffers;
- operating hours and blocked periods;
- confirmed bookings for the next 30 days;
- deposit, cancellation and reschedule policy;
- bank/PayOS details;
- staff users and permission needs.

Document every manual step. The first repeated step that consumes the most operator time becomes the next automation candidate.

### C. Product gap audit and critical fixes

Owner outcome: the existing code completes the one pilot journey.

Audit in this exact order:

1. tenant/host resolution and theme;
2. listing publication and public visibility;
3. hourly availability and timezone;
4. quote, duration and pricing;
5. guest booking creation and idempotency;
6. payment/deposit handoff and reconciliation;
7. tenant booking operations;
8. slot occupancy after confirmation;
9. customer booking lookup;
10. notification and operational evidence.

Classify every discovered problem:

- `P0` — prevents a booking, risks cross-tenant data or creates incorrect money/occupancy;
- `P1` — forces operator database access or makes the normal pilot unusable;
- `P2` — manual workaround exists for the pilot;
- `Later` — does not affect the controlled pilot.

Only P0 and P1 enter the immediate engineering queue.

### D. Controlled launch and learning

Owner outcome: real traffic produces decisions, not just feedback.

- Start with one studio and one public booking link.
- Keep founder-assisted support during the first 20 requests.
- Log every question, failure, manual correction and abandoned request.
- Review metrics and exceptions weekly with the studio.
- Change one important workflow assumption at a time.
- Do not expand to a second vertical during the 60-day pilot.

## 7. Six-week execution roadmap

### Week 0 — Decision freeze and baseline

- Approve this plan and the scope in #178/#179.
- Confirm React Router and ADR 0005 remain the current technical decisions.
- Freeze new affiliate, multi-vertical and advanced-finance work.
- Select the exact local/staging environment and seed baseline.
- Create the pilot evidence template and customer interview sheet.

Exit: everyone uses the same scope, terms and launch gate.

### Week 1 — Validation and first studio data

- Interview five studios.
- Obtain complete data from at least one candidate.
- Create one realistic tenant, house partner and 2–3 hourly listings.
- Import opening hours and existing blocked slots.
- Run storefront browse/listing/availability smoke.

Exit: one candidate can see its own branded listings and availability.

### Week 2 — Core booking journey

- Finish quote and guest checkout smoke.
- Verify booking idempotency and slot protection.
- Verify tenant sees and operates the booking.
- Verify booking lookup and confirmation notification.
- Fix only P0/P1 blockers.
- Run two personalized demos and ask for paid commitment.

Exit: one complete mock-payment booking journey works without database intervention.

### Week 3 — Payment and operational readiness

- Configure the selected live payment/deposit method.
- Verify webhook or manual payment-state workflow.
- Record recovery steps for timeout, duplicate callback and unknown payment state.
- Agree cancellation/reschedule handling with the studio.
- Complete static checks and a full recorded runtime smoke.

Exit: controlled live booking can be accepted and supported safely.

### Week 4 — Controlled live traffic

- Put the booking link on the studio's real customer channels.
- Observe the first five booking requests closely.
- Resolve only P0/P1 issues immediately.
- Capture conversion, deposits and operator time.

Exit: at least five real booking requests and one confirmed paid/deposit booking.

### Week 5 — Repeatability

- Reach 10–20 real requests.
- Reduce repeated manual work.
- Confirm calendar accuracy and booking completion operations.
- Close documentation/runbook gaps.
- Decide whether the second paid studio can be onboarded using the same process.

Exit: normal booking operation is repeatable and understood.

### Week 6 — Go, iterate or pivot

Evaluate the commercial, product and reliability gates.

- `GO`: customers pay, bookings complete and repeated manual steps are clear. Onboard the next studio and automate the highest-cost repeated step.
- `ITERATE`: studios use the system but do not pay or customers abandon the flow. Fix the offer or core workflow before adding scope.
- `PIVOT`: studios do not perceive availability/deposit handling as painful enough or refuse to direct traffic to a booking link.

Exit: a written decision based on transactions and usage.

## 8. Runtime smoke evidence

For every full smoke, record:

- source commit and environment;
- tenant, hostname and user roles;
- house partner, listing and resource IDs;
- local timezone and selected slot;
- quoted subtotal, deposit and payment method;
- idempotency attempt/result;
- booking code and status history;
- payment state and reconciliation action;
- competing booking attempt result;
- customer lookup result;
- notification result;
- operator interventions and time spent;
- known limitations.

Required repository checks:

```bash
pnpm turbo lint typecheck build
pnpm --filter=@booking/api check:rls
```

Then run the real API, storefront, dashboard, PostgreSQL and Redis and exercise the complete pilot journey.

## 9. Pilot metrics

Track weekly by studio:

- personalized contacts;
- interviews;
- demos;
- paid commitments;
- booking-link visits;
- listing-to-checkout starts;
- booking requests;
- confirmed bookings;
- deposits paid;
- gross booking value;
- rejected/cancelled bookings;
- double-booking incidents;
- support questions;
- operator minutes per booking;
- reasons for checkout abandonment;
- studio renewal decision.

## 10. Decision rules after the first pilot

Do not prioritize a feature because it appears in the Master Spec. Prioritize it when pilot evidence shows one of these:

1. It prevents payment or confirmed bookings.
2. It repeatedly consumes operator time.
3. It creates material data, security, occupancy or financial risk.
4. Multiple paying studios request the same outcome.

The first expansion candidate should be chosen from evidence:

- external partners and payouts if studios need third-party inventory;
- daily mode if the same studios sell full-day packages;
- inventory mode if equipment/outfit rental is already producing demand;
- affiliate only after the tenant has a repeatable booking conversion path.

## 11. Immediate next 48 hours

1. Approve and merge the strategy documentation PR.
2. Identify ten named studio prospects.
3. Select one candidate and collect data for two or three hourly rooms.
4. Configure the realistic pilot tenant and house partner.
5. Run the first browse → slot → checkout → booking runtime smoke.
6. Record all P0/P1 gaps as focused issues linked to #179.
7. Schedule two demos and ask for the first paid pilot commitment.
