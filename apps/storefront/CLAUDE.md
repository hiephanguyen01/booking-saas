# apps/storefront — @booking/storefront (React Router 8 SSR, customer-facing)

Local rules for the customer storefront. Root context: [`../../AGENTS.md`](../../AGENTS.md). Frontend
conventions shared with the dashboard: [`../../docs/conventions.md`](../../docs/conventions.md).

## What's different from the dashboard

- **Multi-tenant by `Host` header.** The tenant is resolved per-request from the hostname via a backend
  call in `app/lib/tenant.server.ts` (not from a login). One storefront serves every tenant's domain;
  an unmapped host serves the BookingOS platform landing without creating a tenant session.
- **Bilingual.** Every page nests under a `/:locale` (`vi` | `en`) layout backed by `@booking/i18n`;
  unlocalized legacy paths are kept as redirect route modules for inbound links. The dashboard, by
  contrast, is Vietnamese-hardcoded.
- **Public + guest flows.** Most pages are public; authenticated bits (bookings, checkout) use a
  Redis-backed session; guest checkout authenticates by booking code + email OTP.
- **`~/` alias** cho mọi import vượt cấp (`~/lib/i18n`, `~/components/section-card`), `./sibling` cho
  cùng thư mục — giống hệt dashboard. Không dùng `../` nữa.

## Tenant theming (untrusted input — handle with care)

`app/theme/theme.ts` turns the tenant's `theme_config.colors` into a `:root{…}` block injected once at
SSR (see `root.tsx`), overriding the shadcn base tokens (`--background`, `--primary`, `--ring`) so every
`@booking/ui` component renders in the tenant brand. Rules:

- Tenant color strings are **untrusted** (tenant jsonb). Always pass them through `sanitizeColor()`
  before they enter CSS — it rejects anything but hex / a safe color function and defeats
  `</style>`/CSS injection. Never interpolate a raw tenant value into a style.
- Derive readable text with `contrastToken()` (WCAG luminance pick); never hardcode a foreground.
- Override the **base** token (`--primary`), not `--color-primary`. `--accent` is deliberately NOT
  tenant-driven (it's shadcn's neutral hover surface). Legacy `--sf-primary` / `--sf-accent` /
  `--sf-background` are still emitted for hand-rolled classNames — prefer semantic tokens for new work.

## BFF & data

Server-only `app/lib/*.server.ts` modules wrap `@booking/api-client`; loaders/actions call the backend
server-to-server. **Never fetch the backend from the browser** and never import a `*.server.ts` into
browser code. Forms use `GenericForm` with a zod schema from `@booking/contracts`
(see [`../../docs/conventions.md`](../../docs/conventions.md) → Forms).

Runtime environment reads are centralized in `app/lib/env.server.ts`. Production startup fails when
the API, Redis, session secret, dashboard URL or payment-origin allowlist is missing/unsafe. Unsafe
HTTP methods pass through the root same-origin guard before auth; `/healthz` and `/readyz` are exact
operational exceptions and must never resolve a tenant or session.

Image upload works: `app/routes/uploads.presign.tsx` is a same-origin presign proxy that replays the
auth cookie to the backend `POST /uploads/presign`, then the browser PUTs bytes straight to MinIO/S3.
(The dashboard has its own presign route; the storefront's is real — older docs claimed it had none.)

## Verification

ADR 0005 prohibits automated tests and test scripts. Use the static security gate, lint, typecheck,
production build and manual runtime flows for tenant guards, session rotation/locking,
request-security, parsers, money/idempotency and time-sensitive changes.

## Scripts (verified)

`dev` (`react-router dev`, port `STOREFRONT_PORT`/5173) · `build` · `start`
(`react-router-serve ./build/server/index.js`) · `lint` (`eslint app`) · `security` (static policy
gate) · `typecheck`
(`react-router typegen && tsc`). Requires Node ≥ 22.22.0.
