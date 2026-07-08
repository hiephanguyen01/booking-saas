import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaTx } from '../tenant-context/tenant-db.service';

export interface EmitOptions {
  tenantId?: string;
  eventType: string;
  payload: Prisma.InputJsonValue;
}

/**
 * Writes a domain event into outbox_events INSIDE the caller's transaction —
 * the state change and its event commit or roll back together. The BullMQ
 * relay delivers it afterwards.
 */
@Injectable()
export class OutboxService {
  async emit(tx: PrismaTx, options: EmitOptions): Promise<void> {
    await tx.outboxEvent.create({
      data: {
        tenantId: options.tenantId,
        eventType: options.eventType,
        payload: options.payload,
      },
    });
  }
}
