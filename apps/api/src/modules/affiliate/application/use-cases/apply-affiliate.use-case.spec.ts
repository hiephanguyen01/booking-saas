import { describe, expect, it } from 'vitest';
import type { ApplyAffiliateInput } from '@booking/contracts';
import { fakeCollaborator, fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import type { RecordLegalAcceptanceUseCase } from '../../../legal/application/use-cases/record-legal-acceptance.use-case';
import type {
  ITenantRepository,
  TenantRecord,
} from '../../../tenancy/domain/ports/tenant-repository.port';
import type { NewAffiliate, AffiliateState } from '../../domain/entities/affiliate.entity';
import { TenantInactive } from '../../domain/errors/affiliate-errors';
import { AffiliateReadbackFailed } from '../affiliate-http-errors';
import type {
  AffiliateWithUser,
  IAffiliateReader,
} from '../../domain/ports/affiliate-reader.port';
import type { IAffiliateRepository } from '../../domain/ports/affiliate-repository.port';
import type { ICommissionRuleReader } from '../../domain/ports/commission-rule-reader.port';
import { ApplyAffiliateUseCase } from './apply-affiliate.use-case';

const TENANT_ID = 'tenant-1';
const USER_ID = 'user-1';

const RULE = { affiliateRate: 8n, affiliateRateType: 'percent' as const };

interface Options {
  tenant?: TenantRecord | null;
  existing?: AffiliateState | null;
  readback?: AffiliateWithUser | null;
  legalError?: Error;
}

function harness(options: Options = {}) {
  const created: NewAffiliate[] = [];
  const legalCalls: unknown[] = [];
  const legalTxs: unknown[] = [];
  const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  const tx = fakeTx({
    outboxEvent: {
      create: (args: { data: { eventType: string; payload: Record<string, unknown> } }) => {
        events.push({ eventType: args.data.eventType, payload: args.data.payload });
        return Promise.resolve({});
      },
    },
  });
  const tenantDb = fakeTenantDb({ tx });
  const readbackIds: string[] = [];
  return {
    useCase: new ApplyAffiliateUseCase(
      fakePort<IAffiliateRepository>({
        loadByUser: () => Promise.resolve(options.existing ?? null),
        create: (_tx, data) => {
          created.push(data);
          return Promise.resolve({ id: 'affiliate-new', ...data } as unknown as AffiliateState);
        },
      }),
      fakePort<IAffiliateReader>({
        findByUserWithTenant: (_tx, id) => {
          readbackIds.push(id);
          return Promise.resolve(
            options.readback === undefined
              ? ({
                  id,
                  tenantId: TENANT_ID,
                  customRate: null,
                  tenantHostname: 'studiohub.vn',
                } as unknown as AffiliateWithUser)
              : options.readback,
          );
        },
      }),
      fakePort<ITenantRepository>({
        findById: () =>
          Promise.resolve(
            options.tenant === undefined
              ? ({ id: TENANT_ID, status: 'active' } as TenantRecord)
              : options.tenant,
          ),
      }),
      fakePort<ICommissionRuleReader>({
        findTenantDefault: () => Promise.resolve(RULE as never),
      }),
      tenantDb.service,
      new OutboxService(),
      fakeCollaborator<RecordLegalAcceptanceUseCase>({
        execute: (txArg: unknown, args: unknown) => {
          legalTxs.push(txArg);
          legalCalls.push(args);
          return options.legalError
            ? Promise.reject(options.legalError)
            : Promise.resolve(undefined);
        },
      }),
    ),
    tenantDb,
    created,
    legalCalls,
    legalTxs,
    events,
    readbackIds,
  };
}

const input = (overrides: Record<string, unknown> = {}) =>
  ({
    tenantId: TENANT_ID,
    payoutInfo: { bank: 'Vietcombank', accountNumber: '0071000123456' },
    legalConsent: { acceptedVersionIds: ['doc-v1'], acceptedLocale: 'vi' },
    ...overrides,
  }) as unknown as ApplyAffiliateInput;

describe('ApplyAffiliateUseCase', () => {
  it('answers not-found for an unknown tenant', async () => {
    const { useCase, created } = harness({ tenant: null });

    await expect(useCase.execute(USER_ID, input(), {})).rejects.toBeInstanceOf(TenantNotFound);
    expect(created).toEqual([]);
  });

  it('refuses an application to a SUSPENDED tenant', async () => {
    const { useCase, created } = harness({
      tenant: { id: TENANT_ID, status: 'suspended' } as TenantRecord,
    });

    await expect(useCase.execute(USER_ID, input(), {})).rejects.toBeInstanceOf(TenantInactive);
    expect(created).toEqual([]);
  });

  it('creates the membership PENDING with no negotiated rate', async () => {
    const { useCase, created, tenantDb } = harness();

    await useCase.execute(USER_ID, input(), {});

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(created).toEqual([
      {
        tenantId: TENANT_ID,
        userId: USER_ID,
        status: 'pending',
        customRate: null,
        payoutInfo: { bank: 'Vietcombank', accountNumber: '0071000123456' },
      },
    ]);
  });

  it('records the applicant’s consent, requiring the AFFILIATE terms', async () => {
    const { useCase, legalCalls } = harness();

    await useCase.execute(USER_ID, input(), { ip: '203.0.113.9' });

    expect(legalCalls).toEqual([
      {
        tenantId: TENANT_ID,
        userId: USER_ID,
        partnerId: null,
        acceptedVersionIds: ['doc-v1'],
        requestedLocale: 'vi',
        requiredDocTypes: ['affiliate_terms'],
        ip: '203.0.113.9',
      },
    ]);
  });

  it('fails the whole application when the consent is rejected', async () => {
    // Enforced server-side, not only by the form's required tick. The undo
    // itself is the transaction's job — this asserts the throw, and the test
    // below asserts the write shares that transaction.
    const { useCase } = harness({ legalError: new Error('LEGAL_CONSENT_REQUIRED') });

    await expect(useCase.execute(USER_ID, input(), {})).rejects.toThrow(
      'LEGAL_CONSENT_REQUIRED',
    );
  });

  it('writes the acceptance on the SAME transaction as the membership', async () => {
    // That shared transaction is what makes "no affiliate without their
    // signature" true rather than merely likely.
    const { useCase, legalTxs, tenantDb } = harness();

    await useCase.execute(USER_ID, input(), {});

    expect(legalTxs).toEqual([tenantDb.tx]);
  });

  it('is IDEMPOTENT — re-applying returns the existing membership', async () => {
    // The storefront form is safe to resubmit, so a second POST must not create
    // a second membership.
    const { useCase, created, events, readbackIds } = harness({
      existing: { id: 'affiliate-existing' } as AffiliateState,
    });

    await useCase.execute(USER_ID, input(), {});

    expect(created).toEqual([]);
    expect(events).toEqual([]);
    expect(readbackIds).toEqual(['affiliate-existing']);
  });

  it('does NOT write a second acceptance row on a resubmit', async () => {
    // One tick, one set of rows; an unconditional write would pile up a row per
    // resubmit of a form that is meant to be safe to resubmit.
    const { useCase, legalCalls } = harness({
      existing: { id: 'affiliate-existing' } as AffiliateState,
    });

    await useCase.execute(USER_ID, input(), {});

    expect(legalCalls).toEqual([]);
  });

  it('announces a NEW application only', async () => {
    const { useCase, events } = harness();

    await useCase.execute(USER_ID, input(), {});

    expect(events).toEqual([
      {
        eventType: 'affiliate.applied',
        payload: { affiliateId: 'affiliate-new', userId: USER_ID },
      },
    ]);
  });

  it('RE-READS through the joined view, so the answer carries the storefront host', async () => {
    // The applicant needs the origin their links will point at, not just an id.
    const { useCase } = harness();

    const result = await useCase.execute(USER_ID, input(), {});

    expect(result.affiliate).toMatchObject({ tenantHostname: 'studiohub.vn' });
    expect(result.effectiveRate).toEqual({ rate: 8n, rateType: 'percent', source: 'rule' });
  });

  it('fails loudly when the read-back finds nothing', async () => {
    // Returning a half-built response would hide a broken write.
    const { useCase } = harness({ readback: null });

    await expect(useCase.execute(USER_ID, input(), {})).rejects.toBeInstanceOf(
      AffiliateReadbackFailed,
    );
  });

  it('stores a null ip rather than undefined', async () => {
    const { useCase, legalCalls } = harness();

    await useCase.execute(USER_ID, input(), {});

    expect(legalCalls[0]).toMatchObject({ ip: null });
  });
});
