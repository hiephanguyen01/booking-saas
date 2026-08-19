# SePay payment gateway

BookingOS uses SePay Payment Gateway for tenant-owned VietQR bank-transfer checkout. The integration is
an adapter inside the existing payments bounded context; booking code never imports `sepay-pg-node`.
PayOS/mock compatibility remains, but the dashboard config and production storefront flow currently
expose SePay only.

## Tenant setup

1. Sign in to the dashboard as a tenant owner.
2. Open **Cài đặt → Cổng thanh toán SePay**.
3. Choose `Sandbox` or `Production`, then enter the two tenant-owned credentials:
   - **Merchant ID**: identifies the SePay Payment Gateway merchant.
   - **Merchant Secret Key**: signs checkout fields, authenticates Payment Gateway API calls and
     verifies the Payment Gateway IPN `X-Secret-Key` header.
4. BookingOS encrypts the credentials as one AES-GCM blob in `tenant_gateway_configs`. The API only
   returns environment, active state and Merchant ID; it never returns the secret.

Do not put a tenant Merchant ID or Merchant Secret Key in source code, seed data or `.env.example`.
Rotate any credential pasted into an issue, chat, log or committed file.

## Environment variables

Provider credentials are deliberately **not** process environment variables. BookingOS serves many
tenants in one API process, while every tenant owns a separate SePay account. Tenant owners enter the
Merchant ID and Merchant Secret Key in Dashboard; BookingOS stores the encrypted credential in
`tenant_gateway_configs` under tenant RLS. The same rule applies to PayOS credentials. Vì vậy không
có `SEPAY_MERCHANT_ID`, `SEPAY_SECRET_KEY`, `PAYOS_CLIENT_ID` hay `PAYOS_API_KEY` dùng chung trong
`.env`.

The deployment only needs payment infrastructure variables:

```dotenv
# Stable master secret used to encrypt every tenant gateway credential at rest.
PAYMENTS_ENC_KEY=replace-with-a-long-random-production-secret

# Age of a pending payment before the reconciliation worker queries SePay.
PAYMENT_STALE_SEC=600

# Storefront allowlist for provider handoff URLs.
PAYMENT_REDIRECT_ORIGINS=https://pay-sandbox.sepay.vn,https://pay.sepay.vn
```

Changing `PAYMENTS_ENC_KEY` without first re-encrypting stored credentials makes existing gateway
configs unreadable. Keep it in the production secret manager and use the same value across all API
replicas.

## Payment Gateway IPN configuration

BookingOS checkout uses **SePay Payment Gateway**, so payment confirmation must be configured in the
merchant's Payment Gateway IPN screen—not in the separate Webhooks screen for bank balance changes.

In the SePay merchant console, open **Cổng thanh toán → Cấu hình → IPN** and configure:

```text
Method:       POST
IPN URL:      https://<public-api-domain>/webhooks/sepay
Content-Type: application/json
Authentication: SECRET_KEY (when the screen exposes this option)
```

The endpoint must be public HTTPS. For local Sandbox work, expose API port 3000 with a trusted tunnel
and configure the resulting HTTPS URL. Quick Tunnel `trycloudflare.com` hostnames change after every
restart; update SePay or use a named tunnel with a stable hostname.

Sandbox Payment Gateway is isolated from Production but still sends the real integration flow: IPN
and redirect callbacks. Sandbox and Production have separate Merchant ID/Secret Key pairs. When an
order is paid, SePay sends an IPN with `notification_type = ORDER_PAID`,
`order.order_invoice_number`, transaction status/amount/currency and:

```http
X-Secret-Key: <Merchant Secret Key for the selected environment>
Content-Type: application/json
```

BookingOS resolves the tenant from `order.order_invoice_number` using the admin pool, enters the
tenant's RLS transaction, loads that tenant's Merchant Secret Key, compares `X-Secret-Key` in constant
time, validates VND amount/status and atomically transitions the payment. Duplicate IPNs return HTTP
200 without confirming the booking twice.

### Not the bank-transaction Webhooks screen

The SePay screen offering `API Key`, `HMAC-SHA256`, `OAuth 2.0` and no authentication belongs to the
separate bank-transaction Webhooks product. A Live bank webhook is triggered by a real transaction in
a linked bank account; its Test mode is triggered by **Mô phỏng giao dịch**. Marking a Payment Gateway
Sandbox order paid does not create that bank-transaction webhook log. BookingOS does not use that
HMAC/WH Secret flow for its current `sepay-pg-node` checkout.

## Checkout flow

1. `POST /public/bookings/:id/checkout` creates/reuses a pending `Payment`.
2. `SepayGatewayAdapter` uses `sepay-pg-node` to sign a `BANK_TRANSFER` checkout form.
3. The API returns a provider-neutral `destination` with type `form_post`.
4. The storefront validates `actionUrl` against `PAYMENT_REDIRECT_ORIGINS`, renders hidden fields and
   submits the form directly to SePay.
5. SePay redirects to the tenant booking page with `payment=success`, `payment=error` or
   `payment=cancel` for UX only. The callback is exactly
   `{storefront-origin}/bookings/{booking-code}?payment=...`, preserving the host and port used by the
   customer (for example `http://localhost:5173/bookings/BK-N55RRP?payment=success`). The API parses
   the forwarded Host as an origin and rejects credentials/path/query/hash before constructing these
   URLs. A success redirect shows the pending state until IPN is verified.
6. Only a verified SePay Payment Gateway IPN (or the reconciliation worker) can mark payment succeeded
   and confirm booking.

## Reconciliation and refunds

The reconciliation worker queries SePay order detail by `gateway_order_ref` when a pending payment is
stale. Underpayments never confirm. It also rebuilds missing booking/settlement projections from an
already-succeeded payment and replays `refund.completed` when a successful refund has not converged.

SePay refunds are currently reported as unsupported, so cancellation/dispute refunds follow this
manual workflow:

1. BookingOS creates one refund row for `(booking, reason)` with `manual_required`.
2. Tenant opens **Tài chính → Giao dịch → Hoàn tiền khách hàng**.
3. Tenant transfers exactly the displayed amount outside BookingOS.
4. Tenant enters the bank reference and optional evidence key/note.
5. `POST /tenant/payments/refunds/:id/confirm` atomically marks it succeeded and emits
   `refund.completed`; only then do Booking and Settlement show refunded.

Customer cancellation persists `bookings.refund_due_amount` before the outbox event. If the event is
lost and no refund row exists, reconciliation emits `refund.recovery_requested` with that exact
amount; it never recalculates an old cancellation policy using the current time.

For `no_show`, BookingOS does not refund service money by default, but it creates a separate
`security_deposit` refund for the full security deposit. Reconciliation also recreates this refund
intent when the original no-show event did not produce a refund row. Security-deposit confirmation
does not mark the service booking or settlement refunded.

## Dashboard history

- Tenant: `/tenant/finance/transactions` → `GET /tenant/payments`, protected by
  `tenant.finance.read` and RLS.
- Tenant refunds: the same screen → `GET /tenant/payments/refunds`; manual confirmation requires
  `tenant.payouts.manage`.
- Platform: `/admin/transactions` → `GET /platform/payments`, protected by
  `platform.finance.read` and the admin pool.

Both screens paginate and filter BookingOS's normalized `payments` rows. They do not expose raw IPN
payloads, card data or credentials.

## Verification (no test files)

Use SePay Payment Gateway Sandbox to exercise success, cancel/error redirect, valid/invalid
`X-Secret-Key`, duplicate IPN, unknown invoice number, amount mismatch and lost-IPN reconciliation.
Then run:

```bash
pnpm --filter=@booking/api prisma:deploy
pnpm --filter=@booking/api prisma:generate
pnpm test
pnpm turbo lint typecheck build
```

The repository's tests policy applies ([ADR 0009](./decisions/0009-limited-tests-policy.md)): a new
payments **use case** ships with its unit test beside it; do not add integration/E2E files or a second
runner.
