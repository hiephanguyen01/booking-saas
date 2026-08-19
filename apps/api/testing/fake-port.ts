import type { PrismaTx } from '../src/shared/tenant-context/tenant-db.service';

/**
 * A repository port with only the methods this test needs.
 *
 * Anything else throws by name instead of returning `undefined`, so a use case
 * that starts calling a second port method fails loudly in the test that did not
 * anticipate it rather than silently reading `undefined` and passing.
 */
export function fakePort<T extends object>(stubs: Partial<T>): T {
  return new Proxy(stubs, {
    get(target, property, receiver) {
      // `await`, `expect()` and the inspector probe objects for these; answering
      // "not stubbed" to a probe would turn a passing test into a crash.
      if (typeof property === 'symbol' || property === 'then' || property === 'constructor') {
        return Reflect.get(target, property, receiver) as unknown;
      }
      if (property in target) return Reflect.get(target, property, receiver) as unknown;
      throw new Error(`port method "${property}" was called but this test did not stub it`);
    },
  }) as T;
}

/**
 * Same behaviour, for a collaborator injected by **concrete class** rather than
 * by port token — another use case, typically. A class with private fields is
 * not assignable from an object literal however complete it is, so the stub
 * shape cannot be type-checked here and the cast is deliberate.
 *
 * Prefer a real port where one exists; reach for this only when the constructor
 * signature leaves no choice.
 */
export function fakeCollaborator<T>(stubs: Record<string, unknown>): T {
  return fakePort<Record<string, unknown>>(stubs) as unknown as T;
}

/**
 * A `PrismaTx` carrying only the models this test stubs.
 *
 * Most use cases reach the database through a repository port, and those need
 * nothing but `fakeTenantDb().tx` as an opaque token. A few read the tx directly
 * (`tx.partner.findUnique(…)`); this is for those, and touching an unstubbed
 * model throws by name.
 */
export function fakeTx(models: Record<string, unknown>): PrismaTx {
  return fakeCollaborator<PrismaTx>(models);
}
