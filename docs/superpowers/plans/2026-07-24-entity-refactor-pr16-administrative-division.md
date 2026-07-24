# PR #16 — AdministrativeAddress value object — Implementation Plan

**Goal:** Move the administrative province/ward membership invariant into one immutable,
framework-free `AdministrativeAddress` value object without changing either public cached endpoint,
the exported resolver signature, the resolved record shape, or the global catalog's intentional
tx-less access.

**Sources:** HANDOFF §3, the governing entity-centric design, and the precomputed
`administrative-division` section in `docs/refactor/entity-centric-survey.md`.

## Global constraints

- No tests. Verification is typecheck/lint/build/check:rls plus runtime smoke.
- Keep `ResolveAdministrativeAddressUseCase.execute(provinceCode, wardCode)` and its
  `{ province, ward }` result structurally unchanged for all five cross-module consumers.
- Preserve the exact invalid-selection envelope:
  `400 INVALID_ADMINISTRATIVE_DIVISION — The selected ward does not belong to the selected province`.
- `AdministrativeAddress` is an immutable value object, not a fake mutable aggregate. It imports no
  Nest/Prisma and performs no I/O.
- The repository remains tx-less on `PrismaService.app`: province/ward tables are global reference
  data with no `tenant_id` or RLS policy. Do not introduce `forTenant`.
- Public province/ward lists, sort order, DTOs, controller response shapes, and
  `Cache-Control: public, max-age=86400` are frozen.
- Schema, migrations, seed catalog, effective dates, and all callers are frozen.

## Task 1 — Domain error + immutable value object

Create:

- `domain/errors/administrative-division-errors.ts` with
  `InvalidAdministrativeDivision extends DomainError` and the exact existing envelope.
- `domain/value-objects/administrative-address.value-object.ts`.

`AdministrativeAddress.resolve(province, ward)` accepts nullable catalog records, rejects a missing
record or `ward.provinceCode !== province.code`, and otherwise returns an immutable object exposing
the same `province` and `ward` structures. It does not validate current/effective dates because the
catalog adapter remains the source of the current read model.

Verify API typecheck and commit.

## Task 2 — Candidate lookup port + repository

Replace the invariant-bearing `findWardInProvince(provinceCode, wardCode)` port method with
`findAddressCandidates(provinceCode, wardCode)`, returning independently nullable province and ward
records. Implement it with two global-catalog reads. Do not filter the ward by province code in the
adapter: membership must be decided by the value object.

Keep `listProvinces()` and `listWards(provinceCode)` byte-for-byte in behavior and keep the adapter
on the tx-less `prisma.app` pool.

Verify API typecheck and commit.

## Task 3 — Resolver wiring + frozen consumer review

Wire `ResolveAdministrativeAddressUseCase` to load candidates and call
`AdministrativeAddress.resolve`. Keep its class name, injector token, constructor arity, execute
signature, return structure, and module export unchanged.

Static review:

- no changes to the two read use-cases, controller, DTOs, module wiring, contracts, schema, seed, or
  five partner/listing consumers;
- no Nest/Prisma import in the value object/error;
- no `forTenant`, outbox, clock, or new write path;
- exact error status/code/message.

Verify API lint/typecheck/build and commit.

## Task 4 — Runtime smoke, docs, whole-branch review

- Boot the API on the isolated port and verify both cached public endpoints.
- Resolve a valid seeded province/ward pair through the use-case; resolve a real ward against a
  different real province and an unknown code, both producing the exact domain error.
- Update HANDOFF status, governing spec progress/debt registry where applicable, and the API
  refactored-module list.
- Run full `pnpm turbo lint typecheck build --force` with Node 24.18.0 and `check:rls`.
- Final-review the complete `refactor/entity-centric` branch against the governing spec: frozen
  repositories/CAS/outbox/wire/read-side contracts, framework-free entities, no tests, no schema
  changes, and all open debt honestly recorded.

Commit `docs(refactor): hoàn tất administrative-division và final branch review`, merge
`refactor/entity-administrative-division` into `refactor/entity-centric`, then report the completed
branch and any remaining follow-up debt.
