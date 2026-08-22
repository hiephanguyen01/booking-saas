import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type {
  IBookingRepository,
  PartnerBookingStat,
} from '../../domain/ports/booking-repository.port';
import { PartnerBookingStatsUseCase } from './partner-booking-stats.use-case';

const TENANT_ID = 'tenant-1';

describe('PartnerBookingStatsUseCase', () => {
  it('aggregates within one tenant transaction', async () => {
    // The aggregate is computed by the repository under RLS; a stat leaking across
    // tenants would put another tenant's cancel rate on this dashboard.
    const stats = [] as PartnerBookingStat[];
    const tenantDb = fakeTenantDb();
    const useCase = new PartnerBookingStatsUseCase(
      fakePort<IBookingRepository>({ partnerBookingStats: () => Promise.resolve(stats) }),
      tenantDb.service,
    );

    await expect(useCase.execute(TENANT_ID)).resolves.toBe(stats);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
  });
});
