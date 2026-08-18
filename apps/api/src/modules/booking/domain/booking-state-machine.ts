import type { BookingStatus } from '@booking/contracts';

/**
 * Booking state machine (TONG-QUAN.md §8.2 — the single source of truth). Every
 * status change goes through {@link assertTransition}; the repository never
 * updates `status` directly elsewhere. Pure + framework-free so it is fully
 * unit-testable (DoD: every valid + invalid transition).
 */
export type TransitionActor = 'customer' | 'partner' | 'tenant' | 'system';

export class BookingTransitionError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BookingTransitionError';
  }
}

interface Edge {
  from: BookingStatus;
  to: BookingStatus;
  actors: TransitionActor[];
}

/** The §8.2 transition table. */
const EDGES: readonly Edge[] = [
  { from: 'draft', to: 'pending_payment', actors: ['system'] },
  { from: 'draft', to: 'pending_approval', actors: ['system'] },
  { from: 'draft', to: 'expired', actors: ['system'] },
  { from: 'pending_approval', to: 'pending_payment', actors: ['partner', 'tenant'] },
  { from: 'pending_approval', to: 'rejected', actors: ['partner', 'tenant', 'system'] },
  { from: 'pending_payment', to: 'confirmed', actors: ['system'] },
  { from: 'pending_payment', to: 'expired', actors: ['system'] },
  { from: 'expired', to: 'confirmed', actors: ['system'] }, // late webhook, slot still free
  { from: 'confirmed', to: 'cancelled', actors: ['customer', 'partner', 'tenant'] },
  // `system` is the post-grace-period sweep (§8.5), never an inferred success:
  // it only fires once the partner has had their whole window to say otherwise.
  { from: 'confirmed', to: 'completed', actors: ['partner', 'tenant', 'system'] },
  { from: 'confirmed', to: 'no_show', actors: ['partner', 'tenant'] },
  { from: 'cancelled', to: 'refunded', actors: ['system'] },
  { from: 'completed', to: 'refunded', actors: ['tenant', 'system'] },
  { from: 'no_show', to: 'refunded', actors: ['system'] },
  { from: 'expired', to: 'refunded', actors: ['system'] },
];

/** Throws unless `actor` may move a booking `from → to`. */
export function assertTransition(
  from: BookingStatus,
  to: BookingStatus,
  actor: TransitionActor,
): void {
  const edge = EDGES.find((e) => e.from === from && e.to === to);
  if (!edge) {
    throw new BookingTransitionError('INVALID_TRANSITION', `Cannot move a booking ${from} → ${to}`);
  }
  if (!edge.actors.includes(actor)) {
    throw new BookingTransitionError(
      'FORBIDDEN_ACTOR',
      `A ${actor} cannot move a booking ${from} → ${to}`,
    );
  }
}
