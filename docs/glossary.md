# Glossary

Domain terms an agent can't reliably decode from the schema alone. Authoritative product definitions
live in [`../TONG-QUAN.md`](../TONG-QUAN.md); this is the quick reference.

## Actors

- **Platform** — the operator of Bookify. Earns a subscription fee per tenant + a per-booking commission.
- **Tenant** — a business customer; gets a branded storefront on its own domain(s). The unit of RLS
  isolation.
- **Partner** — a supplier inside a tenant that lists bookable resources (e.g. a studio owner). Applies,
  is approved/verified, and receives payouts.
- **Customer** — an end user who books & pays on a tenant's storefront. May be a **guest** (no password;
  authenticates by booking code + email OTP).
- **Affiliate** — refers customers to a tenant for a commission cut (last-click attribution).

Every actor is a single `User` row; what they can do is decided by **role assignments** in a **scope**
(platform / tenant / partner).

## Catalog & listings

- **Listing type** — a category with a **dynamic attribute schema** and a `searchConfig` (facets/filters
  shown on the storefront). Tenants define their own (e.g. "Studio", "Meeting room").
- **Listing** — a bookable offering of a listing type, owned by a partner.
- **Listing group** — a set of listings sold/managed together (e.g. bundle pricing across a group).
- **Resource** — the actual capacity unit a booking blocks (the GiST exclusion constraint is keyed on
  `resource_id`).
- **Listing structure** — `standalone` | `grouped` | `flexible`. Standalone = one listing; grouped =
  part of a listing group; `flexible` semantics are defined by the listing module (not the schema).
- **Booking mode** — how time/capacity is sold: **hourly**, **daily**, **inventory** (sell N of a
  capacity), **class** (many attendees per slot). Inventory & class modes are excluded from the
  no-double-booking GiST constraint because they oversell up to capacity by design.
- **modeConfig** — per-mode JSON on a listing (prices, blocks/bundle pricing, min/max, granularity,
  deposit). Validated by `@booking/contracts`, not the DB.

## Booking lifecycle

- **Hold** — a short-lived reservation of a slot while the customer checks out. **Redis is the source of
  truth**; `BookingHold` is only an audit mirror. On conversion the hold becomes a booking subject to the
  GiST exclusion constraint.
- **Booking states** — include `draft`, `pending_payment`, `pending_approval`, `confirmed`, `completed`,
  `cancelled`, `no_show`. The exact transition graph, who may trigger each, and what `expiresAt`-driven
  expiry does per status live in the booking use-cases + `TONG-QUAN.md` §8 (not the enum).
- **Snapshots** — a booking freezes `pricingSnapshot`, `commissionSnapshot`, `promotionSnapshot`, and
  `cancellationPolicySnapshot` at creation so later rule changes don't rewrite history.

## Money & finance

- **Ledger** — a **double-entry** book. Entries are grouped by a **journal**; each entry is one-sided
  (debit XOR credit); every journal must balance (`sum(debit) = sum(credit)`); entries are append-only.
  Post a balanced journal, never a lone entry.
- **Account types** — the ledger's chart of accounts (platform revenue, tenant/partner payable,
  customer funds, etc.); see `TONG-QUAN.md` for the exact set.
- **Commission rule** — how a booking's amount splits. `tenantRate` / `platformRate` are **integer
  percent 0–100**. Resolved per booking into a `commissionSnapshot`.
- **Settlement / custody** — the per-booking operational record of money received into the Tenant's
  merchant account. `held` means paid but not yet earned/payable; release happens only after explicit
  completion/no-show handling and the dispute deadline.
- **Settlement dispute** — a Customer claim opened before `disputeUntil`; it locks release, allows one
  Partner response and ends with Tenant release/full-refund/partial-refund adjudication.
- **Payout** — a (manual bank) transfer of a partner's/tenant's accrued balance for a period; `evidence`
  jsonb records proof; states like `processing` / `failed` are operational.
- **Payout allocation** — the amount of one released booking settlement reserved/paid by a specific
  payout run; it is released back when the payout fails.
- **Money = `bigint` VND (đồng); time = `timestamptz` UTC** — see [`data-model.md`](./data-model.md).

## Promotions & affiliate

- **Promo code / partner promotion / auto-campaign** — the promotions module's discount mechanisms;
  applied amounts are captured in a booking's `promotionSnapshot`.
- **Last-click attribution** — an affiliate's `ReferralLink` records a `ReferralClick` (visitor id, ip
  hash, user agent); a subsequent booking is attributed to the **most recent** click's affiliate.
  `AffiliateCommission` moves through pending → confirmed / reversed / clawed_back per booking outcome.

## Partner & moderation

- **Partner application** — the onboarding flow (apply → identity verification → approve). Payout info is
  captured post-approval in the dashboard.
- **Moderation** — listings/groups have a moderation status; an **admin hide** locks the partner out of
  that item. Exact re-publish/cascade rules are in the listing module.

## Platform / infrastructure terms

- **RLS (Row-Level Security)** — Postgres feature that filters rows by `app.tenant_id`; the mechanism of
  tenant isolation. See [`data-model.md`](./data-model.md), [ADR 0002](./decisions/0002-rls-tenant-isolation-forTenant.md).
- **`forTenant`** — `TenantDbService.forTenant(tenantId, tx => …)`; the one entry point for tenant data,
  sets the RLS GUC on the transaction.
- **Outbox** — the transactional inter-module event bus (`OutboxService.emit` / `OutboxHandlerRegistry`);
  see [ADR 0003](./decisions/0003-outbox-for-inter-module.md).
- **Administrative divisions** — Vietnamese provinces/wards reference data (34 provinces, 3321 wards),
  used for partner addresses; its own bounded context + storefront route.
- **Scope** — the authorization boundary (platform / tenant / partner) a permission key is checked in;
  named by `x-tenant-id` / `x-partner-id` headers and verified against role assignments.
