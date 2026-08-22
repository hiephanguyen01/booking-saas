import { describe, expect, it } from 'vitest';
import type { UpdatePartnerTaxStatusInput } from '@booking/contracts';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type { AuditEntry, IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import type { TaxThresholdRule } from '../../../../shared/domain/tax/threshold';
import { PartnerNotFound } from '../../domain/errors/partner-errors';
import type {
  IPartnerRepository,
  PartnerRecord,
} from '../../domain/ports/partner-repository.port';
import type {
  IPartnerTaxRepository,
  PartnerTaxAssessmentRecord,
} from '../../domain/ports/partner-tax-repository.port';
import { UpdatePartnerTaxStatusUseCase } from './update-partner-tax-status.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';
const ACTOR = 'user-admin';
const DB_NOW = new Date('2026-08-19T00:00:00Z');

const RULE: TaxThresholdRule = {
  id: 'rule-2026',
  thresholdAmount: 200_000_000n,
  effectiveFrom: new Date('2020-01-01T00:00:00Z'),
  effectiveTo: null,
  legalRef: 'TT40/2021',
  revision: 1,
};

const partner = (overrides: Record<string, unknown> = {}) =>
  ({ id: PARTNER_ID, isHouse: false, taxStatus: 'household_below_threshold', ...overrides }) as unknown as PartnerRecord;

function harness(existing: PartnerRecord | null = partner()) {
  const overrides: unknown[] = [];
  const statusWrites: unknown[] = [];
  const audits: AuditEntry[] = [];
  const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  const tx = fakeTx({
    outboxEvent: {
      create: (args: { data: { eventType: string; payload: Record<string, unknown> } }) => {
        events.push({ eventType: args.data.eventType, payload: args.data.payload });
        return Promise.resolve({});
      },
    },
  });
  const tenantDb = fakeTenantDb({ tx, now: DB_NOW });
  return {
    useCase: new UpdatePartnerTaxStatusUseCase(
      fakePort<IPartnerRepository>({
        findByIdForUpdate: () => Promise.resolve(existing as never),
        updateTaxStatus: (_tx, partnerId, status) => {
          statusWrites.push({ partnerId, status });
          return Promise.resolve({ id: partnerId, taxStatus: status } as unknown as PartnerRecord);
        },
      }),
      fakePort<IPartnerTaxRepository>({
        listActiveThresholdRules: () => Promise.resolve([RULE]),
        ensureAssessment: () =>
          Promise.resolve({ id: 'assessment-1' } as PartnerTaxAssessmentRecord),
        lockAssessment: () =>
          Promise.resolve({ id: 'assessment-1' } as PartnerTaxAssessmentRecord),
        setManualOverride: (_tx, assessmentId, args) => {
          overrides.push({ assessmentId, ...args });
          return Promise.resolve({} as PartnerTaxAssessmentRecord);
        },
      }),
      fakePort<IAuditWriter>({
        write: (_tx, entry) => {
          audits.push(entry);
          return Promise.resolve();
        },
      }),
      new OutboxService(),
      tenantDb.service,
    ),
    overrides,
    statusWrites,
    audits,
    events,
  };
}

const input = (overrides: Partial<UpdatePartnerTaxStatusInput> = {}) =>
  ({ taxStatus: 'household_declaring', reason: 'Hộ đã vượt ngưỡng', ...overrides }) as UpdatePartnerTaxStatusInput;

describe('UpdatePartnerTaxStatusUseCase', () => {
  it('answers not-found for an unknown partner', async () => {
    const { useCase, statusWrites } = harness(null);

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, input(), ACTOR),
    ).rejects.toBeInstanceOf(PartnerNotFound);
    expect(statusWrites).toEqual([]);
  });

  it('PARKS a manual override so the next settlement cannot undo it', async () => {
    // Without it the automatic threshold rule would reclassify the partner on
    // the very next revenue event.
    const { useCase, overrides } = harness();

    await useCase.execute(TENANT_ID, PARTNER_ID, input(), ACTOR);

    expect(overrides).toEqual([
      {
        assessmentId: 'assessment-1',
        status: 'household_declaring',
        reason: 'Hộ đã vượt ngưỡng',
        actorId: ACTOR,
        // Midnight 1 January of the following year, Asia/Ho_Chi_Minh.
        until: new Date('2026-12-31T17:00:00.000Z'),
        evaluatedAt: DB_NOW,
      },
    ]);
  });

  it('expires the override at the END of the tax year, not indefinitely', async () => {
    // The threshold is a per-year figure; an override outliving its year would
    // silently apply to the next one.
    const { useCase, overrides } = harness();

    await useCase.execute(TENANT_ID, PARTNER_ID, input(), ACTOR);

    const until = (overrides[0] as { until: Date }).until;
    expect(until.getTime()).toBeGreaterThan(DB_NOW.getTime());
    expect(until.toISOString()).toBe('2026-12-31T17:00:00.000Z');
  });

  it('parks NO override for a non-household status', async () => {
    // The assessment only exists for households; a company has no threshold to
    // override.
    const { useCase, overrides, statusWrites } = harness();

    await useCase.execute(TENANT_ID, PARTNER_ID, input({ taxStatus: 'company_vat' }), ACTOR);

    expect(overrides).toEqual([]);
    expect(statusWrites).toEqual([{ partnerId: PARTNER_ID, status: 'company_vat' }]);
  });

  it('records who overrode it and why', async () => {
    const { useCase, audits } = harness();

    await useCase.execute(TENANT_ID, PARTNER_ID, input(), ACTOR);

    expect(audits).toEqual([
      {
        tenantId: TENANT_ID,
        actorUserId: ACTOR,
        action: 'partner.tax_status_overridden',
        entityType: 'partner',
        entityId: PARTNER_ID,
        data: {
          from: 'household_below_threshold',
          to: 'household_declaring',
          reason: 'Hộ đã vượt ngưỡng',
        },
      },
    ]);
  });

  it('announces only a REAL change of classification', async () => {
    // Re-submitting the same status still refreshes the override window, which
    // is why the audit row is unconditional and the event is not.
    const { useCase, events, audits, overrides } = harness();

    await useCase.execute(
      TENANT_ID,
      PARTNER_ID,
      input({ taxStatus: 'household_below_threshold' }),
      ACTOR,
    );

    expect(events).toEqual([]);
    expect(audits).toHaveLength(1);
    expect(overrides).toHaveLength(1);
  });

  it('announces the override as manual, never as a threshold crossing', async () => {
    const { useCase, events } = harness();

    await useCase.execute(TENANT_ID, PARTNER_ID, input(), ACTOR);

    expect(events).toEqual([
      {
        eventType: 'partner.tax_classification_changed',
        payload: {
          partnerId: PARTNER_ID,
          from: 'household_below_threshold',
          to: 'household_declaring',
          reason: 'manual_override',
        },
      },
    ]);
  });
});
