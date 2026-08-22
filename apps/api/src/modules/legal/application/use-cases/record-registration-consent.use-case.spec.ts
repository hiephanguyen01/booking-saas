import { describe, expect, it } from 'vitest';
import { fakeCollaborator, fakeTenantDb } from '~testing';
import type { RecordLegalAcceptanceUseCase } from './record-legal-acceptance.use-case';
import {
  RecordRegistrationConsentUseCase,
  type RecordRegistrationConsentPayload,
} from './record-registration-consent.use-case';

const TENANT_ID = 'tenant-1';

function harness() {
  const calls: Array<{ tx: unknown; args: Record<string, unknown> }> = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new RecordRegistrationConsentUseCase(
      fakeCollaborator<RecordLegalAcceptanceUseCase>({
        execute: (tx: unknown, args: unknown) => {
          calls.push({ tx, args: args as Record<string, unknown> });
          return Promise.resolve(undefined);
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    calls,
  };
}

const payload = (overrides: Partial<RecordRegistrationConsentPayload> = {}) =>
  ({
    userId: 'user-1',
    acceptedVersionIds: ['version-1'],
    acceptedLocale: 'vi',
    ...overrides,
  }) as RecordRegistrationConsentPayload;

describe('RecordRegistrationConsentUseCase', () => {
  it('ACCEPTS superseded versions — the visitor ticked what was current then', async () => {
    // This handler runs up to ~40 minutes after the tick and is retried by the
    // relay; re-applying the stale check could only fail forever, dead-letter
    // the row and leave a registered user with no recorded consent at all.
    const { useCase, calls } = harness();

    await useCase.execute(TENANT_ID, payload());

    expect(calls[0]?.args).toMatchObject({ acceptSupersededVersions: true });
  });

  it('requires NO document types — coverage was enforced at the synchronous edge', async () => {
    // A throw here is a permanent handler failure, not a rejected request.
    const { useCase, calls } = harness();

    await useCase.execute(TENANT_ID, payload());

    expect(calls[0]?.args.requiredDocTypes).toBeUndefined();
  });

  it('records against the tenant, with no partner and a null ip fallback', async () => {
    const { useCase, calls, tenantDb } = harness();

    await useCase.execute(TENANT_ID, payload());

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(calls[0]?.tx).toBe(tenantDb.tx);
    expect(calls[0]?.args).toMatchObject({
      tenantId: TENANT_ID,
      userId: 'user-1',
      partnerId: null,
      acceptedVersionIds: ['version-1'],
      requestedLocale: 'vi',
      ip: null,
    });
  });

  it('carries the ip through when the registration had one', async () => {
    const { useCase, calls } = harness();

    await useCase.execute(TENANT_ID, payload({ ip: '203.0.113.9' }));

    expect(calls[0]?.args).toMatchObject({ ip: '203.0.113.9' });
  });
});
