import type { PrismaTx, TenantDbService } from '../src/shared/tenant-context/tenant-db.service';

/**
 * A `TenantDbService` that runs the callback and records the tenant it was
 * opened for, without a database.
 *
 * What it proves: the use case opened ONE transaction, for the right tenant, and
 * handed the `tx` down to its repositories. That is the tenancy half of every
 * tenant-scoped use case and it is otherwise only observable at runtime.
 *
 * What it does NOT prove: rollback. Nothing here undoes writes when the callback
 * throws, so "the acceptance row rolls back with the state change" stays a claim
 * for runtime smoke, not a unit test. Assert the throw; don't assert the undo.
 */
export interface FakeTenantDb {
  readonly service: TenantDbService;
  /** The `tx` handed to the callback — pass the same object to fake repositories. */
  readonly tx: PrismaTx;
  /** Every tenant id `forTenant` was opened with, in call order. */
  readonly openedFor: string[];
  /**
   * How many times `databaseNow` was read. A guard placed BEFORE the clock read
   * is often the only thing that stops a rejected request costing a query, and
   * that ordering is invisible unless the test counts.
   */
  readonly clockReads: () => number;
}

export interface FakeTenantDbOptions {
  readonly tx?: PrismaTx;
  /**
   * What `databaseNow(tx)` answers. Business deadlines read the Postgres clock,
   * not the app host's, so a use case that compares against `databaseNow` must be
   * tested against a fixed one — and against a DIFFERENT date from any service
   * date in the test, or the two clocks cannot be told apart.
   */
  readonly now?: Date;
}

export function fakeTenantDb(options: FakeTenantDbOptions = {}): FakeTenantDb {
  const tx = options.tx ?? ({} as PrismaTx);
  const openedFor: string[] = [];
  let clockReads = 0;
  const service = {
    forTenant<T>(tenantId: string, fn: (transaction: PrismaTx) => Promise<T>): Promise<T> {
      openedFor.push(tenantId);
      return fn(tx);
    },
    forCurrentTenant<T>(fn: (transaction: PrismaTx) => Promise<T>): Promise<T> {
      return fn(tx);
    },
    databaseNow(): Promise<Date> {
      clockReads += 1;
      return Promise.resolve(options.now ?? new Date());
    },
    // `TenantDbService` has private members, so a structural object is not
    // assignable to it however complete it is. The cast is contained here.
  } satisfies Record<string, unknown> as unknown as TenantDbService;

  return { service, tx, openedFor, clockReads: () => clockReads };
}
