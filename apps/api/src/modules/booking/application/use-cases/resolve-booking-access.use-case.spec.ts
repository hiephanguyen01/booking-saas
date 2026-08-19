import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import { BookingNotFound } from '../../../../shared/domain/errors/booking-not-found';
import { BookingAccessDenied } from '../../domain/errors/booking-domain-errors';
import type { IBookingAccessGrantStore } from '../../domain/ports/booking-access-grant-store.port';
import type { BookingRecord, IBookingRepository } from '../../domain/ports/booking-repository.port';
import type { IOtpStore } from '../../domain/ports/otp-store.port';
import { ResolveBookingAccessUseCase } from './resolve-booking-access.use-case';

const TENANT_ID = 'tenant-1';
const CODE = 'BK-0001';
const CUSTOMER_ID = 'customer-1';

const booking = (): BookingRecord =>
  ({ id: 'booking-1', code: CODE, customerId: CUSTOMER_ID }) as unknown as BookingRecord;

interface Options {
  record?: BookingRecord | null;
  grantValid?: boolean;
  otpValid?: boolean;
}

function harness(options: Options = {}) {
  const checks: string[] = [];
  const grantScopes: unknown[] = [];
  const tenantDb = fakeTenantDb();
  const useCase = new ResolveBookingAccessUseCase(
    fakePort<IBookingRepository>({
      findByCode: () => Promise.resolve(options.record === undefined ? booking() : options.record),
    }),
    fakePort<IOtpStore>({
      verify: () => {
        checks.push('otp');
        return Promise.resolve(options.otpValid ?? false);
      },
    }),
    fakePort<IBookingAccessGrantStore>({
      verify: (scope) => {
        checks.push('grant');
        grantScopes.push(scope);
        return Promise.resolve(options.grantValid ?? false);
      },
    }),
    tenantDb.service,
  );
  return { useCase, tenantDb, checks, grantScopes };
}

describe('ResolveBookingAccessUseCase', () => {
  it('answers 404 for a code this tenant does not have', async () => {
    const { useCase } = harness({ record: null });

    await expect(useCase.execute(TENANT_ID, CODE, {})).rejects.toBeInstanceOf(BookingNotFound);
  });

  it('lets the booking owner through on their session alone', async () => {
    const { useCase, tenantDb, checks } = harness();

    await expect(
      useCase.execute(TENANT_ID, CODE, { sessionUserId: CUSTOMER_ID }),
    ).resolves.toMatchObject({ code: CODE });
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    // No grant or OTP round-trip when the session already proves ownership.
    expect(checks).toEqual([]);
  });

  it('does not let a different logged-in user in on their session', async () => {
    // Being logged in is not the same as owning this booking.
    const { useCase } = harness();

    await expect(
      useCase.execute(TENANT_ID, CODE, { sessionUserId: 'customer-2' }),
    ).rejects.toBeInstanceOf(BookingAccessDenied);
  });

  it('accepts a grant issued for this exact booking', async () => {
    const { useCase, grantScopes } = harness({ grantValid: true });

    await expect(
      useCase.execute(TENANT_ID, CODE, { accessGrant: 'grant-token' }),
    ).resolves.toMatchObject({ code: CODE });
    // The scope is bound to tenant + booking + code, so a grant for a different
    // booking cannot be replayed against this one.
    expect(grantScopes).toEqual([
      { tenantId: TENANT_ID, bookingId: 'booking-1', bookingCode: CODE },
    ]);
  });

  it('falls back to the OTP when the grant does not verify', async () => {
    const { useCase, checks } = harness({ grantValid: false, otpValid: true });

    await expect(
      useCase.execute(TENANT_ID, CODE, { accessGrant: 'stale', otp: '123456' }),
    ).resolves.toMatchObject({ code: CODE });
    expect(checks).toEqual(['grant', 'otp']);
  });

  it('refuses when neither the grant nor the OTP verifies', async () => {
    const { useCase } = harness({ grantValid: false, otpValid: false });

    await expect(
      useCase.execute(TENANT_ID, CODE, { accessGrant: 'stale', otp: 'wrong' }),
    ).rejects.toBeInstanceOf(BookingAccessDenied);
  });

  it('refuses an anonymous request carrying no proof at all', async () => {
    const { useCase, checks } = harness();

    await expect(useCase.execute(TENANT_ID, CODE, {})).rejects.toBeInstanceOf(BookingAccessDenied);
    expect(checks).toEqual([]);
  });
});
