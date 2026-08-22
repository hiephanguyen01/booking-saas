import { describe, expect, it } from 'vitest';
import type { VerifyIdentityInput } from '@booking/contracts';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type { PartnerState } from '../../domain/entities/partner.entity';
import {
  MissingDob,
  NameMismatch,
  NoPendingIdentity,
  PartnerNotFound,
  Under18,
} from '../../domain/errors/partner-errors';
import type {
  IPartnerRepository,
  PartnerRecord,
} from '../../domain/ports/partner-repository.port';
import { VerifyIdentityUseCase } from './verify-identity.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';
const CTX = { userId: 'user-reviewer' };

/** Old enough today, and the two names agree. */
const state = (overrides: Partial<PartnerState> = {}): PartnerState =>
  ({
    id: PARTNER_ID,
    tenantId: TENANT_ID,
    name: 'Studio Giang',
    slug: 'studio-giang',
    description: null,
    partnerType: 'individual',
    isHouse: false,
    status: 'approved',
    taxStatus: null,
    verificationStatus: 'pending',
    verifiedAt: null,
    dateOfBirth: new Date('1995-05-05T00:00:00Z'),
    payoutInfo: { holderName: 'Nguyễn Văn Giang' },
    businessInfo: {},
    contactInfo: {},
    identityInfo: { holderName: 'Nguyen Van Giang', documentNumber: '079095000123' },
    defaultCancellationPolicyId: null,
    ...overrides,
  }) as unknown as PartnerState;

function harness(found: PartnerState | null = state()) {
  const reviews: unknown[] = [];
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
  let lockedReads = 0;
  return {
    useCase: new VerifyIdentityUseCase(
      fakePort<IPartnerRepository>({
        findByIdForUpdate: () => {
          lockedReads += 1;
          return Promise.resolve(found);
        },
        updateIdentityReview: (_tx, id, intent) => {
          reviews.push(intent);
          return Promise.resolve({ id, ...intent } as unknown as PartnerRecord);
        },
      }),
      tenantDb.service,
      new OutboxService(),
    ),
    tenantDb,
    reviews,
    events,
    lockedReads: () => lockedReads,
  };
}

const input = (overrides: Partial<VerifyIdentityInput> = {}) => overrides as VerifyIdentityInput;

describe('VerifyIdentityUseCase', () => {
  it('answers not-found for an unknown partner', async () => {
    const { useCase, reviews } = harness(null);

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, input(), CTX),
    ).rejects.toBeInstanceOf(PartnerNotFound);
    expect(reviews).toEqual([]);
  });

  it('reads the row FOR UPDATE so two concurrent reviews cannot both decide', async () => {
    // The pending gate and the transition share one transaction with a row
    // lock; without it both reviewers pass the check and both write.
    const { useCase, lockedReads, tenantDb } = harness();

    await useCase.execute(TENANT_ID, PARTNER_ID, input(), CTX);

    expect(lockedReads()).toBe(1);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
  });

  it('refuses when there is nothing pending to review', async () => {
    const { useCase, reviews } = harness(state({ verificationStatus: 'unsubmitted' }));

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, input(), CTX),
    ).rejects.toBeInstanceOf(NoPendingIdentity);
    expect(reviews).toEqual([]);
  });

  it('refuses a submission with no date of birth', async () => {
    const { useCase } = harness(state({ dateOfBirth: null }));

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, input(), CTX),
    ).rejects.toBeInstanceOf(MissingDob);
  });

  it('REJECTS an under-18 partner and persists the rejection', async () => {
    // The decision must survive even though the request then fails — otherwise
    // the reviewer sees an error and the partner stays pending forever.
    const { useCase, reviews, events } = harness({
      ...state(),
      dateOfBirth: new Date(new Date().getUTCFullYear() - 17, 0, 1),
    } as PartnerState);

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, input(), CTX),
    ).rejects.toBeInstanceOf(Under18);
    expect(reviews).toEqual([
      expect.objectContaining({ verificationStatus: 'rejected' }),
    ]);
    expect(events).toEqual([
      {
        eventType: 'partner.verification_rejected',
        payload: { partnerId: PARTNER_ID, reason: 'UNDER_18' },
      },
    ]);
  });

  it('REJECTS a payout name that does not match the ID', async () => {
    // The payout account is where the money lands; a mismatch is how it lands
    // in somebody else's.
    const { useCase, events } = harness(
      state({ payoutInfo: { holderName: 'Trần Thị Khác' } }),
    );

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, input(), CTX),
    ).rejects.toBeInstanceOf(NameMismatch);
    expect(events[0]?.payload).toMatchObject({ reason: 'NAME_MISMATCH' });
  });

  it('matches names across diacritics and punctuation', async () => {
    // `Nguyễn Văn Giang` and `NGUYEN VAN GIANG` are the same person; the ID and
    // the bank rarely spell it the same way.
    const { useCase, reviews } = harness(
      state({
        identityInfo: { holderName: 'NGUYEN  VAN-GIANG' },
        payoutInfo: { holderName: 'Nguyễn Văn Giang' },
      }),
    );

    await useCase.execute(TENANT_ID, PARTNER_ID, input(), CTX);

    expect(reviews[0]).toMatchObject({ verificationStatus: 'verified' });
  });

  it('rejects when the ID carries NO holder name at all', async () => {
    // An empty name would otherwise "match" an equally empty payout name.
    const { useCase } = harness(state({ identityInfo: {}, payoutInfo: {} }));

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, input(), CTX),
    ).rejects.toBeInstanceOf(NameMismatch);
  });

  it('verifies an eligible partner, stamping who reviewed it', async () => {
    const { useCase, reviews, events } = harness();
    const before = Date.now();

    const result = await useCase.execute(
      TENANT_ID,
      PARTNER_ID,
      input({ note: 'Khớp giấy tờ' }),
      CTX,
    );

    expect(reviews[0]).toMatchObject({
      verificationStatus: 'verified',
      identityInfo: expect.objectContaining({
        reviewedBy: 'user-reviewer',
        reviewNote: 'Khớp giấy tờ',
      }),
    });
    const verifiedAt = (reviews[0] as { verifiedAt: Date }).verifiedAt.getTime();
    expect(verifiedAt).toBeGreaterThanOrEqual(before);
    expect(result).toMatchObject({ verificationStatus: 'verified' });
    expect(events).toEqual([
      { eventType: 'partner.verified', payload: { partnerId: PARTNER_ID } },
    ]);
  });

  it('KEEPS the submitted document details when it stamps the review', async () => {
    // The review merges into identityInfo; replacing it would throw away the
    // document number the decision was made on.
    const { useCase, reviews } = harness();

    await useCase.execute(TENANT_ID, PARTNER_ID, input(), CTX);

    expect(reviews[0]).toMatchObject({
      identityInfo: expect.objectContaining({ documentNumber: '079095000123' }),
    });
  });
});
