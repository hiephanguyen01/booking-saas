import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import type { AuditEntry, IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  TaxCertificateConcurrentChange,
  TaxCertificateNotFound,
  TaxCertificateNotVoidable,
} from '../../domain/errors/finance-domain-errors';
import type {
  ITaxComplianceRepository,
  TaxCertificateRecord,
} from '../../domain/ports/tax-compliance-repository.port';
import { VoidTaxWithholdingCertificateUseCase } from './void-tax-withholding-certificate.use-case';

const TENANT_ID = 'tenant-1';
const CERTIFICATE_ID = 'cert-1';
const PARTNER_ID = 'partner-1';

const certificate = (status = 'issued'): TaxCertificateRecord =>
  ({
    id: CERTIFICATE_ID,
    tenantId: TENANT_ID,
    partnerId: PARTNER_ID,
    taxYear: 2026,
    version: 1,
    certificateNumber: 'CT-2026-0001',
    status,
  }) as unknown as TaxCertificateRecord;

function harness(
  current: TaxCertificateRecord | null,
  voided: TaxCertificateRecord | null = certificate('voided'),
) {
  const calls: string[] = [];
  const locks: Array<{ partnerId: string; taxYear: number }> = [];
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
  const tenantDb = fakeTenantDb({ tx });
  return {
    useCase: new VoidTaxWithholdingCertificateUseCase(
      fakePort<ITaxComplianceRepository>({
        findCertificate: () => Promise.resolve(current),
        lockCertificateYear: (_tx, _tenantId, partnerId, taxYear) => {
          calls.push('lock');
          locks.push({ partnerId, taxYear });
          return Promise.resolve();
        },
        voidCertificate: () => {
          calls.push('void');
          return Promise.resolve(voided);
        },
      }),
      fakePort<IAuditWriter>({
        write: (_tx, entry) => {
          calls.push('audit');
          audits.push(entry);
          return Promise.resolve();
        },
      }),
      new OutboxService(),
      tenantDb.service,
    ),
    tenantDb,
    calls,
    locks,
    audits,
    events,
  };
}

describe('VoidTaxWithholdingCertificateUseCase', () => {
  it('rejects a certificate this tenant does not have', async () => {
    const { useCase, calls } = harness(null);

    await expect(
      useCase.execute(TENANT_ID, CERTIFICATE_ID, 'sai số liệu', 'staff-1'),
    ).rejects.toBeInstanceOf(TaxCertificateNotFound);
    expect(calls).toEqual([]);
  });

  it.each(['voided', 'draft'])('refuses to void a %s certificate', async (status) => {
    const { useCase, calls } = harness(certificate(status));

    await expect(
      useCase.execute(TENANT_ID, CERTIFICATE_ID, 'sai số liệu', 'staff-1'),
    ).rejects.toBeInstanceOf(TaxCertificateNotVoidable);
    expect(calls).toEqual([]);
  });

  it('locks the partner tax YEAR before voiding', async () => {
    // The certificate number is sequential per partner-year; voiding without the
    // lock lets a concurrent re-issue take the number this void is freeing.
    const { useCase, tenantDb, calls, locks } = harness(certificate());

    await useCase.execute(TENANT_ID, CERTIFICATE_ID, 'sai số liệu', 'staff-1');

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(calls).toEqual(['lock', 'void', 'audit']);
    expect(locks).toEqual([{ partnerId: PARTNER_ID, taxYear: 2026 }]);
  });

  it('fails when the guarded void matched no row', async () => {
    const { useCase, audits } = harness(certificate(), null);

    await expect(
      useCase.execute(TENANT_ID, CERTIFICATE_ID, 'sai số liệu', 'staff-1'),
    ).rejects.toBeInstanceOf(TaxCertificateConcurrentChange);
    expect(audits).toEqual([]);
  });

  it('audits the void with its reason and announces it to the partner', async () => {
    // A voided certificate is tax evidence being withdrawn; both the trail and the
    // partner have to learn why.
    const { useCase, audits, events } = harness(certificate());

    await useCase.execute(TENANT_ID, CERTIFICATE_ID, 'sai số liệu', 'staff-1');

    expect(audits[0]).toMatchObject({
      action: 'tax_certificate.voided',
      entityId: CERTIFICATE_ID,
      actorUserId: 'staff-1',
      data: { partnerId: PARTNER_ID, taxYear: 2026, reason: 'sai số liệu' },
    });
    expect(events).toEqual([
      {
        eventType: 'tax.certificate_voided',
        payload: {
          certificateId: CERTIFICATE_ID,
          partnerId: PARTNER_ID,
          taxYear: 2026,
          certificateNumber: 'CT-2026-0001',
          reason: 'sai số liệu',
        },
      },
    ]);
  });
});
