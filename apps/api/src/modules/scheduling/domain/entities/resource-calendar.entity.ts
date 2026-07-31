import type { AvailabilityExceptionInput } from '@booking/contracts';
import { AvailabilityExceptionNotFound, InvalidAvailabilityException } from '../errors/availability-errors';

/**
 * ResourceCalendar aggregate (§7.4) — the date-specific exception calendar of a
 * single resource (a `closed` day, or a `custom_hours` override of the weekly
 * schedule). Scoped by `resourceId` alone.
 *
 * Owns the exception-shape validation that mirrors zod
 * `availabilityExceptionInputSchema`'s `superRefine`
 * ({@link ResourceCalendar.newException}) and the delete-path ownership gate
 * ({@link ResourceCalendar.assertOwnsException}), both defensive depth: the zod
 * contracts (`contracts/availability.ts`) are the real HTTP boundary.
 *
 * State is ONLY `resourceId` — deliberately NOT the loaded set of existing
 * exceptions. The repository's create is an UPSERT keyed on `(resource, date)`:
 * a second POST for a date that already has an exception OVERWRITES it and
 * still returns 201 — that is the contract, not a bug, and it is this module's
 * compare-and-set. Loading the whole exception set here to detect the collision
 * would add a query and change behaviour, so we don't.
 *
 * Framework-free: no Nest, no Prisma, no zod. No clock, no bigint, no random.
 */
export class ResourceCalendar {
  private constructor(readonly resourceId: string) {}

  /** Open the calendar for one resource. */
  static forResource(resourceId: string): ResourceCalendar {
    return new ResourceCalendar(resourceId);
  }

  /**
   * Validate an incoming exception (defensive mirror of the zod `superRefine`)
   * and hand it straight back. Upsert semantics: if `(resource, date)` already
   * has an exception the repository OVERWRITES it and still answers 201 — a
   * contract, not a bug.
   *
   * - `type === 'custom_hours'` → BOTH `openTime` and `closeTime` are required
   *   and `openTime < closeTime`; otherwise throw {@link InvalidAvailabilityException}
   *   (the `>=` comparison is the same lexical compare the schema's superRefine uses).
   * - `type === 'closed'` → pass through UNTOUCHED, even if the client also sent
   *   `openTime` / `closeTime` (§8a known gap): do not reject, do not strip them.
   *
   * Returns the same input; the repository still applies its `?? null`
   * normalization on persist, unchanged.
   */
  newException(input: AvailabilityExceptionInput): AvailabilityExceptionInput {
    if (input.type === 'custom_hours') {
      if (input.windows && input.windows.length > 0) {
        for (const window of input.windows) {
          if (window.openTime >= window.closeTime) {
            throw new InvalidAvailabilityException('closeTime must be after openTime');
          }
        }
        // Two windows covering the same minute would double-generate that slot.
        // Re-implemented rather than imported from the zod contract: this entity
        // stays free of zod, and this whole method is a deliberate defensive
        // mirror of `availabilityExceptionInputSchema`'s superRefine.
        const sorted = [...input.windows].sort((a, b) => a.openTime.localeCompare(b.openTime));
        for (let index = 1; index < sorted.length; index += 1) {
          if (sorted[index]!.openTime < sorted[index - 1]!.closeTime) {
            throw new InvalidAvailabilityException('Windows must not overlap');
          }
        }
        return input;
      }
      if (!input.openTime || !input.closeTime) {
        throw new InvalidAvailabilityException('custom_hours requires at least one window');
      }
      if (input.openTime >= input.closeTime) {
        throw new InvalidAvailabilityException('closeTime must be after openTime');
      }
    }
    return input;
  }

  /**
   * Delete-path ownership gate: an exception may only be removed through the
   * resource it belongs to. A missing exception, or one whose `resourceId`
   * doesn't match this calendar, is indistinguishable from "not found" —
   * throw {@link AvailabilityExceptionNotFound}.
   */
  assertOwnsException(existing: { resourceId: string } | null): asserts existing is { resourceId: string } {
    if (!existing || existing.resourceId !== this.resourceId) {
      throw new AvailabilityExceptionNotFound();
    }
  }
}
