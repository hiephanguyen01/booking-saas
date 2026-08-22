import { describe, expect, it } from 'vitest';
import type { ApprovePartnerInput } from '@booking/contracts';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type { IAgreementAcceptanceRepository } from '../../../legal/domain/ports/agreement-acceptance-repository.port';
import { InvalidPartnerState, PartnerNotFound } from '../../domain/errors/partner-errors';
import type {
  IPartnerRepository,
  PartnerRecord,
} from '../../domain/ports/partner-repository.port';
import { ApprovePartnerUseCase } from './approve-partner.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';
const CTX = { userId: 'user-approver', ip: '203.0.113.9' };

const partner = (overrides: Partial<PartnerRecord> = {}): PartnerRecord =>
  ({
    id: PARTNER_ID,
    tenantId: TENANT_ID,
    name: 'Studio Giang',
    slug: 'studio-giang',
    description: null,
    partnerType: 'individual',
    isHouse: false,
    status: 'pending',
    taxStatus: null,
    verificationStatus: 'unsubmitted',
    verifiedAt: null,
    dateOfBirth: null,
    payoutInfo: {},
    businessInfo: {},
    contactInfo: {},
    identityInfo: {},
    defaultCancellationPolicyId: null,
    ...overrides,
  }) as unknown as PartnerRecord;

function harness(found: PartnerRecord | null = partner()) {
  const statusWrites: unknown[] = [];
  const agreements: unknown[] = [];
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
  return {
    useCase: new ApprovePartnerUseCase(
      fakePort<IPartnerRepository>({
        findById: () => Promise.resolve(found),
        updateStatus: (_tx, id, intent) => {
          statusWrites.push({ id, intent });
          return Promise.resolve({ ...partner(), id, ...intent });
        },
      }),
      fakePort<IAgreementAcceptanceRepository>({
        record: (_tx, entry) => {
          agreements.push(entry);
          return Promise.resolve();
        },
      }),
      tenantDb.service,
      new OutboxService(),
    ),
    tenantDb,
    statusWrites,
    agreements,
    events,
  };
}

const input = (overrides: Partial<ApprovePartnerInput> = {}) => overrides as ApprovePartnerInput;

describe('ApprovePartnerUseCase', () => {
  it('answers not-found for an unknown partner', async () => {
    const { useCase, statusWrites } = harness(null);

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, input(), CTX),
    ).rejects.toBeInstanceOf(PartnerNotFound);
    expect(statusWrites).toEqual([]);
  });

  it('is IDEMPOTENT for an already-approved partner', async () => {
    // A double-click must not record a second fee-schedule acceptance or emit a
    // second approval event.
    const { useCase, statusWrites, agreements, events } = harness(
      partner({ status: 'approved' }),
    );

    const result = await useCase.execute(TENANT_ID, PARTNER_ID, input(), CTX);

    expect(statusWrites).toEqual([]);
    expect(agreements).toEqual([]);
    expect(events).toEqual([]);
    expect(result).toMatchObject({ status: 'approved' });
  });

  it('refuses to approve a SUSPENDED partner', async () => {
    // Reinstating is a different decision from approving an application.
    const { useCase, statusWrites } = harness(partner({ status: 'suspended' }));

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, input(), CTX),
    ).rejects.toBeInstanceOf(InvalidPartnerState);
    expect(statusWrites).toEqual([]);
  });

  it('approves a pending partner', async () => {
    const { useCase, statusWrites, tenantDb } = harness();

    const result = await useCase.execute(TENANT_ID, PARTNER_ID, input(), CTX);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(statusWrites).toEqual([{ id: PARTNER_ID, intent: { status: 'approved' } }]);
    expect(result).toMatchObject({ status: 'approved' });
  });

  it('RECORDS the fee-schedule acceptance so a commission dispute has proof', async () => {
    // Partner terms were signed by the partner at application time; the
    // approver signs only the commission schedule, and never on their behalf.
    const { useCase, agreements } = harness();

    await useCase.execute(TENANT_ID, PARTNER_ID, input({ agreementVersion: 'v2026-01' }), CTX);

    expect(agreements).toEqual([
      {
        tenantId: TENANT_ID,
        partnerId: PARTNER_ID,
        userId: 'user-approver',
        agreementType: 'commission_schedule',
        documentVersionId: null,
        acceptedLocale: null,
        version: 'v2026-01',
        ip: '203.0.113.9',
      },
    ]);
  });

  it('falls back to the current schedule version when none was supplied', async () => {
    const { useCase, agreements } = harness();

    await useCase.execute(TENANT_ID, PARTNER_ID, input(), CTX);

    expect(agreements[0]).toMatchObject({ agreementType: 'commission_schedule' });
    expect((agreements[0] as { version: string }).version).toBeTruthy();
  });

  it('announces the approval', async () => {
    const { useCase, events } = harness();

    await useCase.execute(TENANT_ID, PARTNER_ID, input(), CTX);

    expect(events).toEqual([
      { eventType: 'partner.approved', payload: { partnerId: PARTNER_ID } },
    ]);
  });
});
