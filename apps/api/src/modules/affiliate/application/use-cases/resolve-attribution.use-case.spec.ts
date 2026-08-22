import { describe, expect, it } from 'vitest';
import { fakePort, fakeTx } from '~testing';
import type {
  AffiliateAttributionCandidate,
  AttributionUserContact,
  IAffiliateAttributionReader,
} from '../../domain/ports/affiliate-attribution-reader.port';
import {
  ResolveAttributionUseCase,
  type AttributionRequest,
} from './resolve-attribution.use-case';

const CANDIDATE: AffiliateAttributionCandidate = {
  affiliateId: 'affiliate-1',
  affiliateUserId: 'user-affiliate',
  referralCode: 'R-ABC123',
  customRate: 15n,
};

interface Options {
  candidate?: AffiliateAttributionCandidate | null;
  contacts?: Record<string, AttributionUserContact | null>;
  isPartnerMember?: boolean;
}

function harness(options: Options = {}) {
  const codes: string[] = [];
  const membershipChecks: Array<{ partnerId: string; userId: string }> = [];
  return {
    useCase: new ResolveAttributionUseCase(
      fakePort<IAffiliateAttributionReader>({
        findApprovedCandidate: (_tx, code) => {
          codes.push(code);
          return Promise.resolve(
            options.candidate === undefined ? CANDIDATE : options.candidate,
          );
        },
        findUserContact: (_tx, userId) =>
          Promise.resolve(
            options.contacts && userId in options.contacts
              ? options.contacts[userId]!
              : { email: `${userId}@studiohub.vn`, phone: null },
          ),
        isPartnerMember: (_tx, partnerId, userId) => {
          membershipChecks.push({ partnerId, userId });
          return Promise.resolve(options.isPartnerMember ?? false);
        },
      }),
    ),
    codes,
    membershipChecks,
  };
}

const tx = fakeTx({});

const req = (overrides: Partial<AttributionRequest> = {}) =>
  ({
    code: 'R-ABC123',
    customerId: 'user-customer',
    listingPartnerId: 'partner-1',
    ...overrides,
  }) as AttributionRequest;

describe('ResolveAttributionUseCase', () => {
  it('DROPS attribution rather than failing the booking', async () => {
    // It runs inside the booking transaction: throwing here would fail a
    // perfectly good checkout because of a bad referral code.
    const { useCase } = harness({ candidate: null });

    await expect(useCase.execute(tx, req())).resolves.toBeNull();
  });

  it('drops a blank code without a lookup', async () => {
    const { useCase, codes } = harness();

    await expect(useCase.execute(tx, req({ code: '  ' }))).resolves.toBeNull();
    expect(codes).toEqual([]);
  });

  it('matches the code case-insensitively', async () => {
    const { useCase, codes } = harness();

    await useCase.execute(tx, req({ code: ' r-abc123 ' }));

    expect(codes).toEqual(['R-ABC123']);
  });

  it('refuses a SELF-referral by user id', async () => {
    const { useCase } = harness();

    await expect(
      useCase.execute(tx, req({ customerId: 'user-affiliate' })),
    ).resolves.toBeNull();
  });

  it('refuses a self-referral by id even when no contact row resolves', async () => {
    // The id comparison is the only check left when the contact lookup answers
    // nothing — without it a user with no readable profile could refer
    // themselves.
    const { useCase } = harness({
      contacts: { 'user-affiliate': null, 'user-customer': null },
    });

    await expect(
      useCase.execute(tx, req({ customerId: 'user-affiliate' })),
    ).resolves.toBeNull();
  });

  it('checks membership of the LISTING’s partner, with the affiliate’s user', async () => {
    // Checking some other partner would let the real self-dealing case through.
    const { useCase, membershipChecks } = harness();

    await useCase.execute(tx, req({ listingPartnerId: 'partner-7' }));

    expect(membershipChecks).toEqual([
      { partnerId: 'partner-7', userId: 'user-affiliate' },
    ]);
  });

  it('refuses a self-referral by shared EMAIL, ignoring case', async () => {
    // A second account with the same address is the obvious way around an
    // id-only check.
    const { useCase } = harness({
      contacts: {
        'user-affiliate': { email: 'giang@studio.vn', phone: null },
        'user-customer': { email: 'GIANG@Studio.VN', phone: null },
      },
    });

    await expect(useCase.execute(tx, req())).resolves.toBeNull();
  });

  it('refuses a self-referral by shared PHONE', async () => {
    const { useCase } = harness({
      contacts: {
        'user-affiliate': { email: 'a@studio.vn', phone: '0901234567' },
        'user-customer': { email: 'b@studio.vn', phone: '0901234567' },
      },
    });

    await expect(useCase.execute(tx, req())).resolves.toBeNull();
  });

  it('does NOT treat two missing phones as a match', async () => {
    // Everyone without a phone would otherwise be the same person.
    const { useCase } = harness({
      contacts: {
        'user-affiliate': { email: 'a@studio.vn', phone: null },
        'user-customer': { email: 'b@studio.vn', phone: null },
      },
    });

    await expect(useCase.execute(tx, req())).resolves.not.toBeNull();
  });

  it('refuses SELF-DEALING — the affiliate works for the listing’s partner', async () => {
    // Otherwise a partner's own staff earns a referral cut on their own
    // inventory.
    const { useCase } = harness({ isPartnerMember: true });

    await expect(useCase.execute(tx, req())).resolves.toBeNull();
  });

  it('returns the affiliate, the code and the negotiated rate', async () => {
    // The rate is frozen onto the booking, so it has to travel with the
    // attribution rather than be re-read at payout time.
    const { useCase } = harness();

    await expect(useCase.execute(tx, req())).resolves.toEqual({
      affiliateId: 'affiliate-1',
      referralCode: 'R-ABC123',
      customRate: 15n,
    });
  });

  it('carries a null custom rate through, meaning "use the tenant default"', async () => {
    const { useCase } = harness({ candidate: { ...CANDIDATE, customRate: null } });

    await expect(useCase.execute(tx, req())).resolves.toMatchObject({ customRate: null });
  });
});
