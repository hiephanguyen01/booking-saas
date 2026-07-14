import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaTx } from '../tenant-context/tenant-db.service';
import type { AuditEntry, IAuditWriter } from './audit-writer.port';

/**
 * The one place `audit_logs` rows are created. The row is written on the caller's
 * tx handle, so it commits atomically with the change it records and inherits the
 * tx's RLS scope (tenant/partner rows) or admin pool (platform rows).
 */
@Injectable()
export class PrismaAuditWriter implements IAuditWriter {
  async write(tx: PrismaTx, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        actorUserId: entry.actorUserId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        ip: entry.ip ?? null,
        data: (entry.data ?? {}) as Prisma.InputJsonObject,
      },
    });
  }
}
