import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type {
  AcceptanceRow,
  IAgreementAcceptanceRepository,
} from '../../domain/ports/agreement-acceptance-repository.port';
import { ListMyAcceptancesUseCase } from './list-my-acceptances.use-case';

const ROW: AcceptanceRow = {
  agreementType: 'partner_terms',
  version: '3',
  documentVersionId: 'version-1',
  acceptedLocale: 'vi',
  acceptedAt: new Date('2026-02-01T08:30:00Z'),
} as AcceptanceRow;

describe('ListMyAcceptancesUseCase', () => {
  it("lists the CALLING user's own signatures, with ISO timestamps", async () => {
    // This is the user's own proof of what they agreed to; another user's would
    // be a privacy leak, and a Date would serialise inconsistently.
    const asked: string[] = [];
    const tenantDb = fakeTenantDb();
    const useCase = new ListMyAcceptancesUseCase(
      fakePort<IAgreementAcceptanceRepository>({
        listByUser: (_tx, userId) => {
          asked.push(userId);
          return Promise.resolve([ROW]);
        },
      }),
      tenantDb.service,
    );

    const result = await useCase.execute('tenant-1', 'user-1');

    expect(tenantDb.openedFor).toEqual(['tenant-1']);
    expect(asked).toEqual(['user-1']);
    expect(result).toEqual([
      {
        agreementType: 'partner_terms',
        version: '3',
        documentVersionId: 'version-1',
        acceptedLocale: 'vi',
        acceptedAt: '2026-02-01T08:30:00.000Z',
      },
    ]);
  });
});
