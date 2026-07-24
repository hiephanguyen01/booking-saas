# packages/contracts — @booking/contracts (the FE↔BE contract)

Local rules. Root context: [`../../AGENTS.md`](../../AGENTS.md).

## What it is

Framework-free **zod schemas + inferred types** shared by the backend and both frontends. The backend
validates requests against these schemas (`createZodDto(...)`); the frontends type loaders/actions and
`GenericForm` values against them (`z.infer<typeof schema>`). This is the single contract — keep it
free of any React/Nest/Prisma import.

- One file per bounded context under `src/contracts/*.ts` (auth, tenancy, partner, listing-type,
  listing, availability, booking, payment, promotion, finance, affiliate, platform, storage,
  common, catalog-search, administrative-division), each exporting a schema + its `z.infer` type.
- `src/index.ts` is the **only** allowed barrel; it re-exports every `contracts/*.ts`.
- Note: i18n messages are **not** here — they moved to `@booking/i18n`.

## Build before consumers see changes

Dual CJS/ESM, built to `dist/` (`main`/`exports` point at `dist`, not `src`). Frontends import schema
**values** from the built package, so after editing a schema **rebuild**:

```bash
pnpm --filter=@booking/contracts build
```

`turbo dev`/`typecheck` depend on `^build`, so a cold start builds it; but during an already-running
`pnpm dev`, an edit here is not picked up until you rebuild. The backend consumes it the same way.

## Adding a schema / type

1. Add or extend the schema in the matching `src/contracts/<domain>.ts`; export its `z.infer` type.
2. Re-export from `src/index.ts` if it's a new file.
3. `pnpm --filter=@booking/contracts build`.
4. Import in app/backend: `import { createBookingInputSchema, type BookingResponse } from '@booking/contracts'`.

For a response change, update all four surfaces in the same commit: shared response schema/type,
API DTO + explicit mapper, dashboard/storefront loader/action consumers, and runtime `schema` parsing
on the BFF request where available. Never keep a hand-written frontend interface that duplicates a
shared API response. Compatibility aliases remain explicit, documented fields until a coordinated
API + frontend removal wave.

Schemas with `.transform()`/`.default()` have differing input/output types — for a form on such a
schema, build a dedicated `useForm<In, Ctx, Out>` instead of `GenericForm`
(see [`../../docs/conventions.md`](../../docs/conventions.md) → Forms).
