import { describe, expect, it } from 'vitest';
import { fakePort } from '~testing';
import type {
  BookingAccessGrantScope,
  IBookingAccessGrantStore,
} from '../../domain/ports/booking-access-grant-store.port';
import { IssueBookingAccessGrantUseCase } from './issue-booking-access-grant.use-case';

const scope = {
  tenantId: 'tenant-1',
  bookingId: 'booking-1',
  bookingCode: 'BK-0001',
} as BookingAccessGrantScope;

function harness(failure?: Error) {
  const issued = { token: 'grant-token', expiresInSec: 900 };
  return new IssueBookingAccessGrantUseCase(
    fakePort<IBookingAccessGrantStore>({
      issue: () => (failure ? Promise.reject(failure) : Promise.resolve(issued as never)),
    }),
  );
}

describe('IssueBookingAccessGrantUseCase', () => {
  it('returns the grant the store issued', async () => {
    await expect(harness().execute(scope)).resolves.toMatchObject({ token: 'grant-token' });
  });

  it('surfaces a store outage on the OTP exchange path', async () => {
    // Obtaining the grant IS the request there; answering 200 with nothing would
    // hand the guest a link that cannot work.
    await expect(harness(new Error('redis down')).execute(scope)).rejects.toThrow('redis down');
  });

  it('swallows a store outage right after checkout', async () => {
    // The booking is already created and paid for. Losing the convenience link
    // costs the guest one click through the OTP flow; failing the checkout
    // response over it would be strictly worse.
    await expect(
      harness(new Error('redis down')).execute(scope, { optional: true }),
    ).resolves.toBeNull();
  });
});
