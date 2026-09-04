# Task 2 report — customer destination and status API

Status: **DONE**

## Delivered

- Added public, booking-scoped manual-refund endpoints for masked status, destination submission/replacement, and customer received/not-received acknowledgement.
- Reused `ResolveBookingAccessUseCase` for authenticated booking ownership or the existing scoped booking access grant. Raw OTP is not accepted by these routes.
- Required a separately verified booking access grant before recording third-party destination consent, so an authenticated session alone cannot consent for a third-party account.
- Added explicit tenant + booking + operation checks and tenant RLS transactions for every payments use case.
- Added optimistic-version checks and repository CAS writes for replay/concurrent-update resistance.
- Added explicit customer mapping that returns bank code, masked account name, last four digits, and consent time only. Ciphertext, key version, fingerprint, full account number, and unmasked account name are never returned, logged, audited, or emitted.
- Allowed destination replacement in pre-claim states and blocked it after a maker claim until the later checker-reopen workflow resets the operation.
- Added completed-only received/not-received follow-up without changing refund completion state.
- Added explicit Nest throttle overrides for customer writes; reads remain under the global throttle.
- Extended the refund-batch port/repository with an explicitly tenant-scoped `findById` query used to prove the operation belongs to the authorized booking.

## Original concern — resolved by the review fix below

The initial Task 2 commit intentionally left the lookup invocation unwired pending explicit PII
authorization. That authorization is now present in the inherited plan, and the review fix documented
below wires the existing port while retaining the unsupported production adapter. No real provider
adapter is added.

## TDD evidence

### RED — four missing customer use cases

Command:

```bash
pnpm exec vitest run --project api apps/api/src/modules/payments/application/use-cases/get-customer-manual-refund-status.use-case.spec.ts apps/api/src/modules/payments/application/use-cases/submit-customer-manual-refund-destination.use-case.spec.ts apps/api/src/modules/payments/application/use-cases/acknowledge-customer-manual-refund-received.use-case.spec.ts apps/api/src/modules/payments/application/use-cases/report-customer-manual-refund-not-received.use-case.spec.ts
```

Result: exit 1; all four suites failed to load because their corresponding use-case modules did not exist. This was the expected initial missing-implementation failure.

### RED — explicit tenant-record defense found during self-review

Command:

```bash
pnpm exec vitest run --project api apps/api/src/modules/payments/application/use-cases/get-customer-manual-refund-status.use-case.spec.ts
```

Result: exit 1; the new cross-tenant repository-record test resolved instead of rejecting. The customer loader was then hardened to compare the operation record's tenant explicitly.

### GREEN — focused customer and entity regression tests

Commands:

```bash
pnpm exec vitest run --project api apps/api/src/modules/payments/application/use-cases/get-customer-manual-refund-status.use-case.spec.ts apps/api/src/modules/payments/application/use-cases/submit-customer-manual-refund-destination.use-case.spec.ts apps/api/src/modules/payments/application/use-cases/acknowledge-customer-manual-refund-received.use-case.spec.ts apps/api/src/modules/payments/application/use-cases/report-customer-manual-refund-not-received.use-case.spec.ts
pnpm exec vitest run --project api apps/api/src/modules/payments/application/use-cases/protect-manual-refund-destination.use-case.spec.ts apps/api/src/modules/payments/application/use-cases/get-customer-manual-refund-status.use-case.spec.ts apps/api/src/modules/payments/application/use-cases/submit-customer-manual-refund-destination.use-case.spec.ts apps/api/src/modules/payments/application/use-cases/acknowledge-customer-manual-refund-received.use-case.spec.ts apps/api/src/modules/payments/application/use-cases/report-customer-manual-refund-not-received.use-case.spec.ts
pnpm exec vitest run tests/architecture/use-case-unit-tests.test.ts
```

Results: 10/10 customer tests passed; 21/21 focused customer/entity tests passed; architecture guard 3/3 passed.

## Full verification

Command run once before commit:

```bash
pnpm test && pnpm turbo lint typecheck build
```

Result: exit 0. `pnpm test` passed 370 files / 2,009 tests. Turbo completed 24/24 lint, typecheck, and build tasks successfully. Existing Vite sourcemap and sandbox cache warnings were non-fatal.

## Self-review

- Confirmed controller flow remains `controller -> use-case -> port -> repository`; no service class was added.
- Confirmed exactly one adjacent unit-test file exists for each of the four new use cases.
- Confirmed every customer response is constructed field-by-field and contains no persistence-only PII fields.
- Confirmed destination state/version eligibility is checked before PII processing; see the review fix below for the subsequently authorized lookup-port call.
- Confirmed no deployment, push, seed, shared-environment mutation, or runtime provider call was performed.

## Task 2 review fix — account-name lookup orchestration

The customer destination use case now injects `AccountNameLookupPort` and calls it only after the
tenant/booking operation has loaded, the expected version and third-party consent have passed, and
the domain entity has confirmed the destination is replaceable. The port receives only the validated,
normalized bank code, account number, and expected account name. The returned outcome drives the
existing domain state policy:

- `matched` -> `ready_for_transfer` with lookup verification timestamps;
- `mismatch` -> blocking `correction_required`;
- `unsupported` and `error` -> `verification_required`.

The production Nest binding remains `UnsupportedAccountNameLookupAdapter`; this fix adds no provider
adapter and performs no real external/PII call. Provider-returned registered names are not persisted,
logged, audited, emitted, or returned.

### Review-fix TDD evidence

RED command:

```bash
pnpm exec vitest run --project api apps/api/src/modules/payments/application/use-cases/submit-customer-manual-refund-destination.use-case.spec.ts
```

Result: exit 1; 4/7 tests failed for the intended missing behavior. The unsupported case showed zero
lookup calls, while matched, mismatch, and error were all persisted as `unsupported` /
`verification_required`. The three authorization/state guard tests remained green.

GREEN commands:

```bash
pnpm exec vitest run --project api apps/api/src/modules/payments/application/use-cases/submit-customer-manual-refund-destination.use-case.spec.ts
pnpm --filter=@booking/api typecheck
```

Results: focused use-case spec passed 7/7; API TypeScript check exited 0 after Prisma client generation.
The spec also asserts that stale version, missing third-party OTP consent, and post-claim lock failures
do not invoke lookup/crypto or persist a CAS patch.

### Review-fix regression verification

Command:

```bash
pnpm test && pnpm --filter=@booking/api lint && pnpm --filter=@booking/api typecheck
```

Result: exit 0. The repository test run passed 370 files / 2,012 tests; API lint and API TypeScript
checks both completed successfully. Prisma generation reported only the expected missing local `.env`
notice and completed successfully.
