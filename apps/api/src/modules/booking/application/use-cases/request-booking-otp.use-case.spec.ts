import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeCollaborator, fakePort, fakeTenantDb } from '~testing';
import { BookingNotFound } from '../../../../shared/domain/errors/booking-not-found';
import type { SendBookingOtpUseCase } from '../../../notification/application/use-cases/send-booking-otp.use-case';
import type { BookingRecord, IBookingRepository } from '../../domain/ports/booking-repository.port';
import type { IOtpStore } from '../../domain/ports/otp-store.port';
import { RequestBookingOtpUseCase } from './request-booking-otp.use-case';

const TENANT_ID = 'tenant-1';
const CODE = 'BK-0001';

const booking = (): BookingRecord => ({ id: 'booking-1', code: CODE }) as unknown as BookingRecord;

function harness(record: BookingRecord | null, sendFails = false) {
  const sends: unknown[] = [];
  const tenantDb = fakeTenantDb();
  const useCase = new RequestBookingOtpUseCase(
    fakePort<IBookingRepository>({ findByCode: () => Promise.resolve(record) }),
    fakePort<IOtpStore>({ issue: () => Promise.resolve({ otp: '123456', expiresInSec: 300 }) }),
    tenantDb.service,
    fakeCollaborator<SendBookingOtpUseCase>({
      execute: (...args: unknown[]) => {
        sends.push(args);
        return sendFails ? Promise.reject(new Error('smtp down')) : Promise.resolve();
      },
    }),
  );
  return { useCase, tenantDb, sends };
}

describe('RequestBookingOtpUseCase', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects a code this tenant does not have', async () => {
    const { useCase, sends } = harness(null);

    await expect(useCase.execute(TENANT_ID, CODE)).rejects.toBeInstanceOf(BookingNotFound);
    // No OTP is issued and nothing is emailed for a code that does not resolve —
    // otherwise this endpoint becomes a code oracle.
    expect(sends).toEqual([]);
  });

  it('issues the code and emails it to the booking customer', async () => {
    const { useCase, tenantDb, sends } = harness(booking());

    const result = await useCase.execute(TENANT_ID, CODE);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(sends).toEqual([[TENANT_ID, 'booking-1', '123456', 300]]);
    expect(result).toMatchObject({ code: CODE, expiresInSec: 300 });
  });

  it('returns the OTP in the response outside production only', async () => {
    // The plaintext code is never persisted; echoing it back is a dev affordance
    // and would be a handover of the credential in production.
    const { useCase } = harness(booking());

    await expect(useCase.execute(TENANT_ID, CODE)).resolves.toHaveProperty('devOtp', '123456');
  });
});
