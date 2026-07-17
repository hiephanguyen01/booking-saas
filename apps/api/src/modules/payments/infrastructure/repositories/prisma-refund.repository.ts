import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  CreateRefundData,
  IRefundRepository,
  RefundRecord,
} from '../../domain/ports/refund-repository.port';

type Row = Prisma.RefundGetPayload<Record<string, never>>;

function toRecord(r: Row): RefundRecord {
  return {
    id: r.id,
    paymentId: r.paymentId,
    bookingId: r.bookingId,
    amount: r.amount,
    status: r.status,
    gatewayRefundId: r.gatewayRefundId,
  };
}

@Injectable()
export class PrismaRefundRepository implements IRefundRepository {
  async create(tx: PrismaTx, tenantId: string, data: CreateRefundData): Promise<RefundRecord> {
    return toRecord(
      await tx.refund.create({
        data: {
          tenantId,
          paymentId: data.paymentId,
          bookingId: data.bookingId,
          amount: data.amount,
          status: data.status,
          reason: data.reason ?? null,
          gatewayRefundId: data.gatewayRefundId ?? null,
        },
      }),
    );
  }

  async existsForBooking(tx: PrismaTx, bookingId: string): Promise<boolean> {
    return (await tx.refund.count({ where: { bookingId } })) > 0;
  }

  async lockForBooking(tx: PrismaTx, bookingId: string): Promise<void> {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('refund:' || ${bookingId}))`);
  }
}
