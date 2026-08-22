import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type {
  IBookingRepository,
  PartnerCalendarBooking,
} from '../../domain/ports/booking-repository.port';
import { PartnerCalendarUseCase } from './partner-calendar.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';

function harness() {
  const calls: Array<{ partnerId: string; filters: Record<string, unknown> }> = [];
  const rows = [] as PartnerCalendarBooking[];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new PartnerCalendarUseCase(
      fakePort<IBookingRepository>({
        listForPartnerCalendar: (_tx, partnerId, filters) => {
          calls.push({ partnerId, filters: filters as Record<string, unknown> });
          return Promise.resolve(rows);
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    calls,
    rows,
  };
}

describe('PartnerCalendarUseCase', () => {
  it('feeds only the calling partner, inside its tenant transaction', async () => {
    const { useCase, tenantDb, calls, rows } = harness();

    await expect(useCase.execute({ tenantId: TENANT_ID, partnerId: PARTNER_ID })).resolves.toBe(
      rows,
    );
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(calls[0]?.partnerId).toBe(PARTNER_ID);
  });

  it('passes the window and the narrowing filters straight through', async () => {
    const { useCase, calls } = harness();
    const from = new Date('2026-09-01T00:00:00Z');
    const to = new Date('2026-09-30T00:00:00Z');

    await useCase.execute({
      tenantId: TENANT_ID,
      partnerId: PARTNER_ID,
      q: 'BK-00',
      status: 'confirmed',
      from,
      to,
    });

    expect(calls[0]?.filters).toEqual({ q: 'BK-00', status: 'confirmed', from, to });
  });

  it('leaves the window unbounded when no dates are given', async () => {
    const { useCase, calls } = harness();

    await useCase.execute({ tenantId: TENANT_ID, partnerId: PARTNER_ID });

    expect(calls[0]?.filters).toEqual({
      q: undefined,
      status: undefined,
      from: undefined,
      to: undefined,
    });
  });
});
