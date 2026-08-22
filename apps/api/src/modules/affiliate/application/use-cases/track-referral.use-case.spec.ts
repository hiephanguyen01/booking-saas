import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { TrackReferralInput } from '@booking/contracts';
import { fakeCollaborator, fakePort, fakeTenantDb } from '~testing';
import type { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import type {
  ApprovedReferralClick,
  IAffiliateAttributionReader,
} from '../../domain/ports/affiliate-attribution-reader.port';
import type {
  IReferralLinkRepository,
  ReferralClickData,
} from '../../domain/ports/referral-link-repository.port';
import { TrackReferralUseCase } from './track-referral.use-case';

const HOST = 'studiohub.vn';
const TENANT_ID = 'tenant-9';

function harness(link: ApprovedReferralClick | null = { linkId: 'link-1' }) {
  const clicks: Array<{ tenantId: string; data: ReferralClickData }> = [];
  const increments: string[] = [];
  const codes: string[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new TrackReferralUseCase(
      fakePort<IReferralLinkRepository>({
        recordClick: (_tx, tenantId, data) => {
          clicks.push({ tenantId, data });
          return Promise.resolve();
        },
        incrementClicks: (_tx, linkId) => {
          increments.push(linkId);
          return Promise.resolve();
        },
      }),
      fakePort<IAffiliateAttributionReader>({
        findApprovedForClick: (_tx, code) => {
          codes.push(code);
          return Promise.resolve(link);
        },
      }),
      fakeCollaborator<ResolveTenantByHostUseCase>({
        execute: () => Promise.resolve({ id: TENANT_ID }),
      }),
      tenantDb.service,
    ),
    tenantDb,
    clicks,
    increments,
    codes,
  };
}

const input = (overrides: Partial<TrackReferralInput> = {}) =>
  ({ code: 'R-ABC123', ...overrides }) as TrackReferralInput;

describe('TrackReferralUseCase', () => {
  it('NEVER says which affiliate a code belongs to', async () => {
    // This endpoint is public and unauthenticated: the answer is only whether
    // the BFF should set the cookie.
    const { useCase } = harness();

    const result = await useCase.execute(HOST, input(), {});

    expect(result).toEqual({ valid: true });
  });

  it('answers the SAME shape for an unknown or suspended code', async () => {
    // A distinct answer would turn the endpoint into a code-enumeration oracle.
    const { useCase, clicks } = harness(null);

    await expect(useCase.execute(HOST, input(), {})).resolves.toEqual({ valid: false });
    expect(clicks).toEqual([]);
  });

  it('answers invalid for a blank code without a lookup', async () => {
    const { useCase, codes } = harness();

    await expect(useCase.execute(HOST, input({ code: '   ' }), {})).resolves.toEqual({
      valid: false,
    });
    expect(codes).toEqual([]);
  });

  it('matches the code case-insensitively', async () => {
    const { useCase, codes } = harness();

    await useCase.execute(HOST, input({ code: '  r-abc123 ' }), {});

    expect(codes).toEqual(['R-ABC123']);
  });

  it('HASHES the visitor IP rather than storing it', async () => {
    // A raw IP in a click log is personal data with no analytic value the hash
    // does not already carry.
    const { useCase, clicks } = harness();

    await useCase.execute(HOST, input({ visitorId: 'visitor-1' }), {
      ip: '203.0.113.9',
      userAgent: 'Firefox',
    });

    const expected = createHash('sha256').update('203.0.113.9').digest('hex');
    expect(clicks).toEqual([
      {
        tenantId: TENANT_ID,
        data: {
          referralLinkId: 'link-1',
          visitorId: 'visitor-1',
          ipHash: expected,
          userAgent: 'Firefox',
        },
      },
    ]);
    expect(JSON.stringify(clicks)).not.toContain('203.0.113.9');
  });

  it('stores nulls rather than undefined when the request carried nothing', async () => {
    const { useCase, clicks } = harness();

    await useCase.execute(HOST, input(), {});

    expect(clicks[0]?.data).toEqual({
      referralLinkId: 'link-1',
      visitorId: null,
      ipHash: null,
      userAgent: null,
    });
  });

  it('bumps the click counter on the matched link', async () => {
    const { useCase, increments, tenantDb } = harness();

    await useCase.execute(HOST, input(), {});

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(increments).toEqual(['link-1']);
  });
});
