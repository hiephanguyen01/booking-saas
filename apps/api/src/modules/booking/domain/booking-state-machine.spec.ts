import { describe, expect, it } from 'vitest';
import type { BookingStatus } from '@booking/contracts';
import {
  assertTransition,
  BookingTransitionError,
  canTransition,
  type TransitionActor,
} from './booking-state-machine';

const VALID: [BookingStatus, BookingStatus, TransitionActor][] = [
  ['draft', 'pending_payment', 'system'],
  ['draft', 'pending_approval', 'system'],
  ['draft', 'expired', 'system'],
  ['pending_approval', 'pending_payment', 'partner'],
  ['pending_approval', 'rejected', 'partner'],
  ['pending_payment', 'confirmed', 'system'],
  ['pending_payment', 'expired', 'system'],
  ['expired', 'confirmed', 'system'],
  ['confirmed', 'cancelled', 'customer'],
  ['confirmed', 'completed', 'system'],
  ['confirmed', 'no_show', 'partner'],
  ['cancelled', 'refunded', 'system'],
  ['completed', 'refunded', 'tenant'],
  ['no_show', 'completed', 'system'],
];

describe('booking state machine', () => {
  it('allows every §8.2 transition for the right actor', () => {
    for (const [from, to, actor] of VALID) {
      expect(() => assertTransition(from, to, actor)).not.toThrow();
      expect(canTransition(from, to)).toBe(true);
    }
  });

  it('rejects transitions that are not in the table', () => {
    const invalid: [BookingStatus, BookingStatus][] = [
      ['draft', 'confirmed'], // must go through pending_payment
      ['pending_payment', 'completed'],
      ['confirmed', 'pending_payment'], // no going back
      ['completed', 'cancelled'],
      ['refunded', 'confirmed'],
      ['rejected', 'pending_payment'],
    ];
    for (const [from, to] of invalid) {
      expect(canTransition(from, to)).toBe(false);
      expect(() => assertTransition(from, to, 'system')).toThrowError(
        expect.objectContaining({ code: 'INVALID_TRANSITION' }),
      );
    }
  });

  it('forbids the wrong actor on a valid edge', () => {
    // A customer cannot confirm their own payment, mark no-show, or approve.
    expect(() => assertTransition('pending_payment', 'confirmed', 'customer')).toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN_ACTOR' }),
    );
    expect(() => assertTransition('confirmed', 'no_show', 'customer')).toThrowError(
      BookingTransitionError,
    );
    expect(() => assertTransition('pending_approval', 'pending_payment', 'customer')).toThrow(
      BookingTransitionError,
    );
  });
});
