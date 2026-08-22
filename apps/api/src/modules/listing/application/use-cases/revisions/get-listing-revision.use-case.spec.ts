import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import { ListingNotFound, ListingNotOwned } from '../../../domain/errors/listing-errors';
import type {
  IListingRepository,
  ListingRecord,
} from '../../../domain/ports/listing-repository.port';
import type { IListingRevisionRepository } from '../../../domain/ports/listing-revision-repository.port';
import { GetListingRevisionUseCase } from './get-listing-revision.use-case';

const TENANT_ID = 'tenant-1';
const LISTING_ID = 'listing-1';
const PARTNER_ID = 'partner-1';
const REVISION_ID = 'revision-1';

function listing(overrides: Record<string, unknown> = {}): ListingRecord {
  return {
    id: LISTING_ID,
    tenantId: TENANT_ID,
    partnerId: PARTNER_ID,
    title: 'Studio A',
    description: 'Phòng chụp rộng rãi.',
    ...overrides,
  } as unknown as ListingRecord;
}

function revision(overrides: Record<string, unknown> = {}) {
  return {
    id: REVISION_ID,
    tenantId: TENANT_ID,
    targetType: 'listing',
    targetId: LISTING_ID,
    status: 'pending',
    payload: { title: 'Studio A (mới)' },
    submittedAt: new Date('2026-08-01T00:00:00Z'),
    reviewedAt: null,
    reviewNote: null,
    appliedAt: null,
    ...overrides,
  } as never;
}

interface Options {
  record?: ListingRecord | null;
  pending?: unknown;
  open?: unknown;
}

function harness(options: Options = {}) {
  const reads: string[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new GetListingRevisionUseCase(
      fakePort<IListingRepository>({
        findById: () => Promise.resolve(options.record === undefined ? listing() : options.record),
      }),
      fakePort<IListingRevisionRepository>({
        findPending: () => {
          reads.push('findPending');
          return Promise.resolve((options.pending ?? null) as never);
        },
        findOpen: () => {
          reads.push('findOpen');
          return Promise.resolve((options.open ?? null) as never);
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    reads,
  };
}

describe('GetListingRevisionUseCase', () => {
  it('answers not-found for a listing this tenant does not have', async () => {
    const { useCase } = harness({ record: null });

    await expect(useCase.execute(TENANT_ID, LISTING_ID)).rejects.toBeInstanceOf(ListingNotFound);
  });

  it("refuses another partner's listing on a partner-scoped call", async () => {
    const { useCase } = harness({ record: listing({ partnerId: 'partner-2' }) });

    await expect(
      useCase.execute(TENANT_ID, LISTING_ID, { requirePartnerId: PARTNER_ID }),
    ).rejects.toBeInstanceOf(ListingNotOwned);
  });

  it('answers null when nothing is open — the form shows the live listing', async () => {
    const { useCase, tenantDb } = harness();

    await expect(useCase.execute(TENANT_ID, LISTING_ID)).resolves.toBeNull();
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
  });

  it('returns the OPEN edit by default, so a rejection keeps its content', async () => {
    // The partner has to be able to read why it came back without losing what they
    // wrote, so the default read includes the latest rejection, not just pending.
    const { useCase, reads } = harness({
      open: revision({ status: 'rejected', reviewNote: 'Bỏ số điện thoại' }),
    });

    const response = await useCase.execute(TENANT_ID, LISTING_ID);

    expect(reads).toEqual(['findOpen']);
    expect(response).toMatchObject({ status: 'rejected', reviewNote: 'Bỏ số điện thoại' });
  });

  it('reads only the pending one when the caller asks for that', async () => {
    const { useCase, reads } = harness({ pending: revision() });

    await useCase.execute(TENANT_ID, LISTING_ID, { pendingOnly: true });

    expect(reads).toEqual(['findPending']);
  });

  it('reduces the stored payload to what actually differs', async () => {
    // The raw payload never crosses the wire: a reviewer needs the diff, and an
    // unchanged field in the payload is noise.
    const { useCase } = harness({ open: revision({ payload: { title: 'Studio A' } }) });

    const response = await useCase.execute(TENANT_ID, LISTING_ID);

    expect(response?.diff).toEqual([]);
  });
});
