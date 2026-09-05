import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { INotificationInboxRepository } from '../../domain/ports/notification-inbox-repository.port';
import type { INotificationReader } from '../../domain/ports/notification-reader.port';
import { DispatchTenantEventUseCase } from './dispatch-tenant-event.use-case';

const TENANT_ID = 'tenant-1';
const STAFF = [
  { userId: 'user-1', email: 'a@studiohub.vn', name: 'A', locale: 'vi' },
  { userId: 'user-2', email: 'b@studiohub.vn', name: 'B', locale: 'vi' },
];

interface Options {
  recipients?: typeof STAFF;
  subject?: string | null;
}

function harness(options: Options = {}) {
  const permissionsAsked: string[] = [];
  const subjectLookups: Array<{ kind: string; id: string }> = [];
  const inserts: unknown[][] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new DispatchTenantEventUseCase(
      fakePort<INotificationReader>({
        loadTenantStaffWithPermission: (_tx, _tenantId, permission) => {
          permissionsAsked.push(permission);
          return Promise.resolve((options.recipients ?? STAFF) as never);
        },
        loadNotificationSubject: (_tx, kind, id) => {
          subjectLookups.push({ kind, id });
          return Promise.resolve(options.subject === undefined ? 'Studio Giang' : options.subject);
        },
      }),
      fakePort<INotificationInboxRepository>({
        insertMany: (_tx, rows) => {
          inserts.push(rows as unknown[]);
          return Promise.resolve();
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    permissionsAsked,
    subjectLookups,
    inserts,
  };
}

describe('DispatchTenantEventUseCase', () => {
  it('ignores an event the tenant plan does not cover', async () => {
    const { useCase, tenantDb } = harness();

    await useCase.execute(TENANT_ID, 'booking.confirmed', { bookingId: 'b1' });

    expect(tenantDb.openedFor).toEqual([]);
  });

  it('addresses only the staff holding the event’s PERMISSION', async () => {
    // The bell is a work queue: telling someone who cannot act on it is noise.
    const { useCase, permissionsAsked } = harness();

    await useCase.execute(TENANT_ID, 'partner.applied', { partnerId: 'partner-1' });

    expect(permissionsAsked).toEqual(['tenant.partners.approve']);
  });

  it('writes nothing when nobody holds that permission', async () => {
    const { useCase, inserts, subjectLookups } = harness({ recipients: [] });

    await useCase.execute(TENANT_ID, 'partner.applied', { partnerId: 'partner-1' });

    expect(inserts).toEqual([]);
    expect(subjectLookups).toEqual([]);
  });

  it('reads the subject ONCE per event, not once per recipient', async () => {
    const { useCase, subjectLookups } = harness();

    await useCase.execute(TENANT_ID, 'partner.applied', { partnerId: 'partner-1' });

    expect(subjectLookups).toEqual([{ kind: 'partner_name', id: 'partner-1' }]);
  });

  it('gives every recipient a row, deduped per recipient', async () => {
    // A redelivered event must not stack duplicate bell rows.
    const { useCase, inserts } = harness();

    await useCase.execute(TENANT_ID, 'partner.applied', { partnerId: 'partner-1' });

    expect(inserts[0]).toEqual([
      {
        tenantId: TENANT_ID,
        userId: 'user-1',
        area: 'tenant',
        eventType: 'partner.applied',
        title: 'Đơn đăng ký đối tác mới',
        body: 'Studio Giang',
        targetType: 'tenant_partner',
        targetId: 'partner-1',
        dedupeKey: 'partner.applied:partner-1:user-1',
      },
      expect.objectContaining({ userId: 'user-2', dedupeKey: 'partner.applied:partner-1:user-2' }),
    ]);
  });

  it('tolerates a payload whose id is missing or not a string', async () => {
    // Outbox payloads are untyped JSON; a bad id must not crash the relay.
    const { useCase, inserts, subjectLookups } = harness();

    await useCase.execute(TENANT_ID, 'partner.applied', { partnerId: 42 });

    expect(subjectLookups).toEqual([]);
    expect(inserts[0]?.[0]).toMatchObject({
      body: null,
      targetId: null,
      dedupeKey: 'partner.applied:none:user-1',
    });
  });

  it('does the whole operation in ONE transaction', async () => {
    // Recipients, the subject read and the insert share a scope — never nested,
    // never one per query.
    const { useCase, tenantDb } = harness();

    await useCase.execute(TENANT_ID, 'partner.applied', { partnerId: 'partner-1' });

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
  });

  it('keeps the 24h and 48h manual-refund reminders distinct and batch-scoped', async () => {
    const { useCase, inserts, subjectLookups } = harness({ subject: 'BK-REFUND-01' });
    const refundBatchId = '33333333-3333-4333-8333-333333333333';

    await useCase.execute(TENANT_ID, 'manual_refund.customer_details_reminder', {
      refundBatchId,
      hours: 24,
      destinationAccountCiphertext: 'secret-ciphertext',
    });
    await useCase.execute(TENANT_ID, 'manual_refund.customer_details_reminder', {
      refundBatchId,
      hours: 48,
      destinationAccountCiphertext: 'secret-ciphertext',
    });

    expect(subjectLookups).toEqual([
      { kind: 'refund_batch_booking_code', id: refundBatchId },
      { kind: 'refund_batch_booking_code', id: refundBatchId },
    ]);
    expect(inserts.map((rows) => (rows[0] as { dedupeKey: string }).dedupeKey)).toEqual([
      `manual_refund.customer_details_reminder:${refundBatchId}:24:user-1`,
      `manual_refund.customer_details_reminder:${refundBatchId}:48:user-1`,
    ]);
    expect(JSON.stringify(inserts)).not.toContain('secret-ciphertext');
  });
});
