import { describe, expect, it } from 'vitest';
import type { LegalDocumentType } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import type { ITenantRepository, TenantRecord } from '../../../tenancy/domain/ports/tenant-repository.port';
import type {
  IAgreementAcceptanceRepository,
  PendingRow,
} from '../../domain/ports/agreement-acceptance-repository.port';
import type {
  ILegalDocumentRepository,
  VersionRow,
} from '../../domain/ports/legal-document-repository.port';
import {
  ListPendingAcceptancesUseCase,
  type PendingAcceptanceScope,
} from './list-pending-acceptances.use-case';

const TENANT_ID = 'tenant-1';
const USER_ID = 'user-1';

const pending = (overrides: Record<string, unknown> = {}): PendingRow =>
  ({
    docType: 'partner_terms',
    versionId: 'version-1',
    versionNo: 3,
    ...overrides,
  }) as unknown as PendingRow;

const version = (locales: string[] = ['vi']) =>
  ({
    id: 'version-1',
    versionNo: 3,
    isMaterialChange: true,
    publishedAt: new Date('2026-01-01T00:00:00Z'),
    docType: 'partner_terms',
    translations: locales.map((locale) => ({ locale, title: `T-${locale}`, bodyMd: 'b' })),
  }) as VersionRow & { docType: LegalDocumentType };

interface Options {
  tenant?: TenantRecord | null;
  pending?: PendingRow[];
  version?: (VersionRow & { docType: LegalDocumentType }) | null;
}

function harness(options: Options = {}) {
  const asked: Array<{ userId: string; types: readonly string[]; partnerId?: string | null }> = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new ListPendingAcceptancesUseCase(
      fakePort<IAgreementAcceptanceRepository>({
        pendingTypes: (_tx, userId, types, partnerId) => {
          asked.push({ userId, types, partnerId });
          return Promise.resolve(options.pending ?? [pending()]);
        },
      }),
      fakePort<ILegalDocumentRepository>({
        findVersionById: () =>
          Promise.resolve(options.version === undefined ? version() : options.version),
      }),
      fakePort<ITenantRepository>({
        findById: () =>
          Promise.resolve(
            options.tenant === undefined
              ? ({ id: TENANT_ID, defaultLocale: 'vi' } as TenantRecord)
              : options.tenant,
          ),
      }),
      tenantDb.service,
    ),
    tenantDb,
    asked,
  };
}

describe('ListPendingAcceptancesUseCase', () => {
  it('answers not-found for an unknown tenant', async () => {
    const { useCase } = harness({ tenant: null });

    await expect(
      useCase.execute(TENANT_ID, USER_ID, 'partner' as PendingAcceptanceScope),
    ).rejects.toBeInstanceOf(TenantNotFound);
  });

  it('gates each principal on ITS OWN document types', async () => {
    // A partner is not asked to accept the privacy policy to publish a listing.
    const partner = harness();
    const affiliate = harness();
    const customer = harness();

    await partner.useCase.execute(TENANT_ID, USER_ID, 'partner' as PendingAcceptanceScope);
    await affiliate.useCase.execute(TENANT_ID, USER_ID, 'affiliate' as PendingAcceptanceScope);
    await customer.useCase.execute(TENANT_ID, USER_ID, 'customer' as PendingAcceptanceScope);

    expect(partner.asked[0]?.types).toEqual(['partner_terms']);
    expect(affiliate.asked[0]?.types).toEqual(['affiliate_terms']);
    expect(customer.asked[0]?.types).toEqual(['customer_terms', 'privacy_policy']);
  });

  it('NARROWS a partner check to the partner the caller is acting as', async () => {
    // A user in two partner orgs would otherwise have the check answered
    // against whichever acceptance happened to exist.
    const { useCase, asked } = harness();

    await useCase.execute(
      TENANT_ID,
      USER_ID,
      'partner' as PendingAcceptanceScope,
      'partner-1',
    );

    expect(asked[0]).toMatchObject({ userId: USER_ID, partnerId: 'partner-1' });
  });

  it('renders each pending document in the tenant’s DEFAULT locale', async () => {
    // The interstitial is not locale-negotiated; it shows the tenant's own
    // canonical text.
    const { useCase, tenantDb } = harness();

    const result = await useCase.execute(TENANT_ID, USER_ID, 'partner' as PendingAcceptanceScope);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ versionId: 'version-1', title: 'T-vi' });
  });

  it('prefers the DEFAULT locale even when the version also has another', async () => {
    // The interstitial is not locale-negotiated: with both translations present
    // only the tenant's own default decides which text is shown.
    const { useCase } = harness({ version: version(['en', 'vi']) });

    const result = await useCase.execute(TENANT_ID, USER_ID, 'partner' as PendingAcceptanceScope);

    expect(result[0]).toMatchObject({ title: 'T-vi' });
  });

  it('falls back when the version lacks the default locale', async () => {
    const { useCase } = harness({ version: version(['en']) });

    const result = await useCase.execute(TENANT_ID, USER_ID, 'partner' as PendingAcceptanceScope);

    expect(result[0]).toMatchObject({ title: 'T-en' });
  });

  it('SKIPS a pending row whose version has vanished, rather than failing', async () => {
    // The gate blocks writes; making it throw would lock the partner out
    // entirely over one broken row.
    const { useCase } = harness({ version: null });

    await expect(
      useCase.execute(TENANT_ID, USER_ID, 'partner' as PendingAcceptanceScope),
    ).resolves.toEqual([]);
  });

  it('answers an empty list when nothing is pending', async () => {
    const { useCase } = harness({ pending: [] });

    await expect(
      useCase.execute(TENANT_ID, USER_ID, 'partner' as PendingAcceptanceScope),
    ).resolves.toEqual([]);
  });
});
