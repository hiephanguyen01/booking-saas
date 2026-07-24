/**
 * Resource aggregate (§7.3/§9.1) — the calendar-holding resource a listing
 * points at for availability; several listings can share one (e.g. one room
 * booked by two different listing entries).
 *
 * Deliberately thin: this aggregate only carries the write assembly
 * `create-resource.use-case.ts` needs. Timezone resolution
 * (`resolveTenantTimezone`, when the caller doesn't supply one) happens in
 * the use-case before {@link Resource.provision} is called — this aggregate
 * only accepts the already-resolved value, it never reads a clock or a
 * tenant's settings itself.
 *
 * NOT owned here (deliberately): whether `partnerId` actually belongs to the
 * calling tenant is never checked — `create-resource.use-case.ts` has never
 * verified it, a preserved known gap (§8a).
 *
 * Framework-free: no Nest, no Prisma.
 */

/** Validated insert payload (id/tenantId/createdAt assigned by the DB). */
export interface NewResource {
  partnerId: string;
  name: string;
  timezone: string;
}

export class Resource {
  /** Assemble a new resource. Passthrough — `timezone` arrives already
   *  resolved by the caller. */
  static provision(input: { partnerId: string; name: string; timezone: string }): NewResource {
    return { partnerId: input.partnerId, name: input.name, timezone: input.timezone };
  }
}
