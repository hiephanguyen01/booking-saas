import { describe, expect, it } from 'vitest';
import type { SubmitIdentityInput } from '@booking/contracts';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { PartnerNotFound } from '../../domain/errors/partner-errors';
import type { IPartnerReader } from '../../domain/ports/partner-reader.port';
import type {
  IPartnerRepository,
  PartnerRecord,
} from '../../domain/ports/partner-repository.port';
import { SubmitIdentityUseCase } from './submit-identity.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';

function harness(tenantId: string | null = TENANT_ID) {
  const submissions: unknown[] = [];
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
    useCase: new SubmitIdentityUseCase(
      fakePort<IPartnerReader>({ tenantIdOfPartner: () => Promise.resolve(tenantId) }),
      fakePort<IPartnerRepository>({
        updateIdentitySubmission: (_tx, id, intent) => {
          submissions.push(intent);
          return Promise.resolve({ id, ...intent } as unknown as PartnerRecord);
        },
      }),
      tenantDb.service,
      new OutboxService(),
    ),
    tenantDb,
    submissions,
    events,
  };
}

const input = (overrides: Partial<SubmitIdentityInput> = {}) =>
  ({
    dateOfBirth: '1995-05-05',
    documentType: 'cccd',
    documentNumber: '079095000123',
    holderName: 'Nguyen Van Giang',
    ...overrides,
  }) as SubmitIdentityInput;

describe('SubmitIdentityUseCase', () => {
  it('answers not-found when the partner belongs to no tenant', async () => {
    const { useCase, submissions } = harness(null);

    await expect(useCase.execute(PARTNER_ID, input())).rejects.toBeInstanceOf(PartnerNotFound);
    expect(submissions).toEqual([]);
  });

  it("opens the transaction on the PARTNER's own tenant", async () => {
    // The route is partner-scoped and carries no tenant header, so the tenant
    // has to be resolved from the partner itself.
    const { useCase, tenantDb } = harness('tenant-9');

    await useCase.execute(PARTNER_ID, input());

    expect(tenantDb.openedFor).toEqual(['tenant-9']);
  });

  it('moves verification to PENDING for a human to review', async () => {
    // eKYC is Phase 3; nothing here may self-verify.
    const { useCase, submissions } = harness();

    await useCase.execute(PARTNER_ID, input());

    expect(submissions[0]).toMatchObject({
      verificationStatus: 'pending',
      identityInfo: {
        documentType: 'cccd',
        documentNumber: '079095000123',
        holderName: 'Nguyen Van Giang',
      },
    });
  });

  it('parses the date of birth as UTC MIDNIGHT, not a local instant', async () => {
    // A local-time parse shifts the date by the host offset, which can move an
    // 18th birthday across the boundary the review gate checks.
    const { useCase, submissions } = harness();

    await useCase.execute(PARTNER_ID, input({ dateOfBirth: '1995-05-05' }));

    expect((submissions[0] as { dateOfBirth: Date }).dateOfBirth.toISOString()).toBe(
      '1995-05-05T00:00:00.000Z',
    );
  });

  it('announces the submission so the tenant gets its review task', async () => {
    const { useCase, events } = harness();

    await useCase.execute(PARTNER_ID, input());

    expect(events).toEqual([
      { eventType: 'partner.identity_submitted', payload: { partnerId: PARTNER_ID } },
    ]);
  });
});
