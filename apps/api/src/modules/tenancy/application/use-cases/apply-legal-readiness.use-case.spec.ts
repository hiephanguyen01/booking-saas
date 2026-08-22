import { describe, expect, it } from 'vitest';
import { fakePort } from '~testing';
import type { ITenantRepository } from '../../domain/ports/tenant-repository.port';
import { ApplyLegalReadinessUseCase } from './apply-legal-readiness.use-case';

const TENANT_ID = 'tenant-1';
const EMITTED_AT = new Date('2026-08-19T10:00:00Z');

function harness(applied = true) {
  const writes: Array<{
    tenantId: string;
    readyAt: Date | null;
    count: number;
    emittedAt: Date;
  }> = [];
  return {
    useCase: new ApplyLegalReadinessUseCase(
      fakePort<ITenantRepository>({
        setLegalReadiness: (tenantId, readyAt, count, emittedAt) => {
          writes.push({ tenantId, readyAt, count, emittedAt });
          return Promise.resolve(applied);
        },
      }),
    ),
    writes,
  };
}

describe('ApplyLegalReadinessUseCase', () => {
  it('STAMPS a readiness time when the tenant became ready', async () => {
    const { useCase, writes } = harness();
    const before = Date.now();

    await useCase.execute(TENANT_ID, {
      legalReady: true,
      publishedCount: 4,
      emittedAt: EMITTED_AT,
    });

    const readyAt = writes[0]?.readyAt?.getTime() ?? 0;
    expect(readyAt).toBeGreaterThanOrEqual(before);
    expect(readyAt).toBeLessThanOrEqual(Date.now());
    expect(writes[0]).toMatchObject({ tenantId: TENANT_ID, count: 4 });
  });

  it('CLEARS the stamp when the tenant stopped being ready', async () => {
    // Unpublishing a required document must darken the storefront, which only
    // happens if the column goes back to null.
    const { useCase, writes } = harness();

    await useCase.execute(TENANT_ID, {
      legalReady: false,
      publishedCount: 3,
      emittedAt: EMITTED_AT,
    });

    expect(writes[0]).toMatchObject({ readyAt: null, count: 3 });
  });

  it('hands the EMIT time to the repository as the compare-and-set key', async () => {
    // Outbox delivery is at-least-once and out of order, and this column decides
    // whether a storefront serves traffic — a redelivered older event must not
    // resurrect a state the tenant has left.
    const { useCase, writes } = harness();

    await useCase.execute(TENANT_ID, {
      legalReady: true,
      publishedCount: 4,
      emittedAt: EMITTED_AT,
    });

    expect(writes[0]?.emittedAt).toBe(EMITTED_AT);
  });

  it('swallows a dropped stale event instead of failing the handler', async () => {
    // Throwing would make the outbox retry an event that is correctly being
    // ignored, forever.
    const { useCase } = harness(false);

    await expect(
      useCase.execute(TENANT_ID, {
        legalReady: true,
        publishedCount: 4,
        emittedAt: EMITTED_AT,
      }),
    ).resolves.toBeUndefined();
  });
});
