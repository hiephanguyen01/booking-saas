import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import type { InboxRow } from '../../domain/notification-area';
import { TENANT_NOTIFICATION_PLAN } from '../../domain/tenant-notification-plan';
import {
  NOTIFICATION_READER,
  type INotificationReader,
} from '../../domain/ports/notification-reader.port';
import {
  NOTIFICATION_INBOX_REPOSITORY,
  type INotificationInboxRepository,
} from '../../domain/ports/notification-inbox-repository.port';

/**
 * Tenant-facing outbox events → the tenant bell (in-app only, no email).
 *
 * Fan-out is filtered by permission: only staff holding the plan's key receive
 * a row, so the bell never titles a task whose screen would 403.
 *
 * Idempotent through the unique index on (user_id, dedupe_key). Out-of-order
 * redelivery is harmless because a notification is an append, not a snapshot —
 * unlike handlers writing absolute state, this one needs no `createdAt` guard.
 */
@Injectable()
export class DispatchTenantEventUseCase {
  constructor(
    @Inject(NOTIFICATION_READER) private readonly reader: INotificationReader,
    @Inject(NOTIFICATION_INBOX_REPOSITORY) private readonly inbox: INotificationInboxRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const plan = TENANT_NOTIFICATION_PLAN[eventType];
    if (!plan) return;
    const subjectId = asUuid(payload[plan.subjectIdKey]);
    const targetId = plan.targetIdKey ? asUuid(payload[plan.targetIdKey]) : null;
    const dedupePart = plan.dedupePayloadKey
      ? asDedupePart(payload[plan.dedupePayloadKey])
      : null;

    // ONE transaction for the whole operation: recipients, the single subject
    // lookup, and the insert. Never nest `forTenant`, never call it per query.
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const recipients = await this.reader.loadTenantStaffWithPermission(
        tx, tenantId, plan.permission,
      );
      if (recipients.length === 0) return;

      // One read per EVENT, not per recipient.
      const body = subjectId
        ? await this.reader.loadNotificationSubject(tx, plan.subjectKind, subjectId)
        : null;

      const rows: InboxRow[] = recipients.map((r) => ({
        tenantId,
        userId: r.userId,
        area: 'tenant',
        eventType,
        title: plan.title,
        body,
        targetType: plan.targetType,
        targetId,
        dedupeKey: `${eventType}:${subjectId ?? 'none'}${dedupePart ? `:${dedupePart}` : ''}:${r.userId}`,
      }));
      await this.inbox.insertMany(tx, rows);
    });
  }
}

/** Outbox payloads are `unknown` JSON; accept only a string id. */
function asUuid(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asDedupePart(value: unknown): string | null {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
}
