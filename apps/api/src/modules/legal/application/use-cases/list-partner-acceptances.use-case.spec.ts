import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type {
  AcceptanceRow,
  IAgreementAcceptanceRepository,
} from '../../domain/ports/agreement-acceptance-repository.port';
import { ListPartnerAcceptancesUseCase } from './list-partner-acceptances.use-case';

const ROW: AcceptanceRow = {
  agreementType: 'commission_schedule',
  version: 'v2026-01',
  documentVersionId: null,
  acceptedLocale: null,
  acceptedAt: new Date('2026-02-01T08:30:00Z'),
} as AcceptanceRow;

describe('ListPartnerAcceptancesUseCase', () => {
  it("lists THIS partner's signatures, preserving the null document fields", async () => {
    // A fee-schedule acceptance has no document version and no locale — it is
    // a version string, and blanking those would misreport what was signed.
    const asked: string[] = [];
    const tenantDb = fakeTenantDb();
    const useCase = new ListPartnerAcceptancesUseCase(
      fakePort<IAgreementAcceptanceRepository>({
        listByPartner: (_tx, partnerId) => {
          asked.push(partnerId);
          return Promise.resolve([ROW]);
        },
      }),
      tenantDb.service,
    );

    const result = await useCase.execute('tenant-1', 'partner-1');

    expect(tenantDb.openedFor).toEqual(['tenant-1']);
    expect(asked).toEqual(['partner-1']);
    expect(result).toEqual([
      {
        agreementType: 'commission_schedule',
        version: 'v2026-01',
        documentVersionId: null,
        acceptedLocale: null,
        acceptedAt: '2026-02-01T08:30:00.000Z',
      },
    ]);
  });
});
