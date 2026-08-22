import { describe, expect, it } from 'vitest';
import type { CreateReferralLinkInput } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import type { NewReferralLink } from '../../domain/entities/referral-link.entity';
import {
  ReferralCodeCollision,
  ReferralListingRequired,
} from '../../domain/errors/affiliate-errors';
import type {
  IReferralLinkReader,
  ReferralLinkRecord,
} from '../../domain/ports/referral-link-reader.port';
import type { IReferralLinkRepository } from '../../domain/ports/referral-link-repository.port';
import { CreateReferralLinkUseCase } from './create-referral-link.use-case';

const TENANT_ID = 'tenant-1';
const AFFILIATE_ID = 'affiliate-1';

function harness(takenCodes: string[] = []) {
  const created: NewReferralLink[] = [];
  const probed: string[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new CreateReferralLinkUseCase(
      fakePort<IReferralLinkRepository>({
        create: (_tx, link) => {
          created.push(link);
          return Promise.resolve({ id: 'link-1', ...link } as unknown as ReferralLinkRecord);
        },
      }),
      fakePort<IReferralLinkReader>({
        findByCode: (_tx, code) => {
          probed.push(code);
          return Promise.resolve(
            probed.length <= takenCodes.length ? ({ id: 'other' } as ReferralLinkRecord) : null,
          );
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    created,
    probed,
  };
}

const input = (overrides: Partial<CreateReferralLinkInput> = {}) =>
  ({ target: 'tenant_home', ...overrides }) as CreateReferralLinkInput;

describe('CreateReferralLinkUseCase', () => {
  it('REFUSES a listing target with no listing', async () => {
    // The link would resolve to nothing and silently lose every click.
    const { useCase, created, tenantDb } = harness();

    await expect(
      useCase.execute(TENANT_ID, AFFILIATE_ID, input({ target: 'listing' })),
    ).rejects.toBeInstanceOf(ReferralListingRequired);
    expect(created).toEqual([]);
    expect(tenantDb.openedFor).toEqual([]);
  });

  it('mints a code in the expected shape, and a DIFFERENT one each time', async () => {
    // A fixed code would collide on the very next link and, worse, attribute
    // two affiliates' clicks to one of them.
    const { useCase, created } = harness();

    await useCase.execute(TENANT_ID, AFFILIATE_ID, input());
    await useCase.execute(TENANT_ID, AFFILIATE_ID, input());

    expect(created[0]?.code).toMatch(/^R-[0-9A-Z]{6}$/);
    expect(created[1]?.code).not.toBe(created[0]?.code);
  });

  it('DISCARDS a listing id on a tenant-home link', async () => {
    // Storing it would make the row lie about what the link targets.
    const { useCase, created } = harness();

    await useCase.execute(
      TENANT_ID,
      AFFILIATE_ID,
      input({ target: 'tenant_home', listingId: 'listing-1' }),
    );

    expect(created[0]).toMatchObject({ target: 'tenant_home', listingId: null });
  });

  it('keeps the listing id on a listing link', async () => {
    const { useCase, created } = harness();

    await useCase.execute(
      TENANT_ID,
      AFFILIATE_ID,
      input({ target: 'listing', listingId: 'listing-1' }),
    );

    expect(created[0]).toMatchObject({
      tenantId: TENANT_ID,
      affiliateId: AFFILIATE_ID,
      target: 'listing',
      listingId: 'listing-1',
    });
  });

  it('RETRIES past a code collision', async () => {
    // Codes are six random characters; a collision is rare but not impossible,
    // and failing the request over one would be gratuitous.
    const { useCase, created, probed } = harness(['taken-once']);

    await useCase.execute(TENANT_ID, AFFILIATE_ID, input());

    expect(probed).toHaveLength(2);
    expect(created).toHaveLength(1);
  });

  it('gives up after five collisions rather than looping forever', async () => {
    const { useCase, created, probed } = harness(['a', 'b', 'c', 'd', 'e', 'f']);

    await expect(
      useCase.execute(TENANT_ID, AFFILIATE_ID, input()),
    ).rejects.toBeInstanceOf(ReferralCodeCollision);
    expect(probed).toHaveLength(5);
    expect(created).toEqual([]);
  });
});
