import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaTx } from '../../../shared/tenant-context/tenant-db.service';
import type { PaymentConfigurationLockPort } from '../domain/ports/payment-configuration-lock.port';

@Injectable()
export class PostgresPaymentConfigurationLock implements PaymentConfigurationLockPort {
  async acquire(tx: PrismaTx, tenantId: string): Promise<void> {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('gateway-config:' || ${tenantId}))`,
    );
  }
}
