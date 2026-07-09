import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { GatewayKey } from '../../domain/ports/payment-gateway.port';
import type {
  CreatePaymentData,
  IPaymentRepository,
  PaymentRecord,
  PaymentRef,
} from '../../domain/ports/payment-repository.port';

type Row = Prisma.PaymentGetPayload<Record<string, never>>;

function toRecord(p: Row): PaymentRecord {
  return {
    id: p.id,
    tenantId: p.tenantId,
    bookingId: p.bookingId,
    gateway: p.gateway as GatewayKey,
    kind: p.kind,
    amount: p.amount,
    status: p.status,
    gatewayTxnId: p.gatewayTxnId,
    idempotencyKey: p.idempotencyKey,
    paidAt: p.paidAt,
  };
}

@Injectable()
export class PrismaPaymentRepository implements IPaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(tx: PrismaTx, tenantId: string, data: CreatePaymentData): Promise<PaymentRecord> {
    return toRecord(
      await tx.payment.create({
        data: {
          tenantId,
          bookingId: data.bookingId,
          gateway: data.gateway,
          kind: data.kind,
          amount: data.amount,
          gatewayTxnId: data.gatewayTxnId,
          idempotencyKey: data.idempotencyKey,
          gatewayPayload: (data.gatewayPayload ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      }),
    );
  }

  async findActivePendingByBooking(tx: PrismaTx, bookingId: string): Promise<PaymentRecord | null> {
    const p = await tx.payment.findFirst({ where: { bookingId, status: 'pending' }, orderBy: { createdAt: 'desc' } });
    return p ? toRecord(p) : null;
  }

  async findSucceededByBooking(tx: PrismaTx, bookingId: string): Promise<PaymentRecord | null> {
    const p = await tx.payment.findFirst({ where: { bookingId, status: 'succeeded' }, orderBy: { createdAt: 'desc' } });
    return p ? toRecord(p) : null;
  }

  /** Atomic: only the first concurrent webhook flips pending → succeeded (§11.2). */
  async markSucceeded(tx: PrismaTx, id: string, paidAt: Date, payload: unknown): Promise<boolean> {
    const affected = await tx.$executeRaw(Prisma.sql`
      UPDATE payments
      SET status = 'succeeded', paid_at = ${paidAt}, gateway_payload = ${JSON.stringify(payload ?? null)}::jsonb, updated_at = now()
      WHERE id = ${id}::uuid AND status <> 'succeeded'`);
    return affected > 0;
  }

  async updateStatus(tx: PrismaTx, id: string, status: Row['status']): Promise<void> {
    await tx.payment.update({ where: { id }, data: { status } });
  }

  async findByGatewayTxnId(gatewayTxnId: string): Promise<PaymentRef | null> {
    const p = await this.prisma.admin.payment.findFirst({ where: { gatewayTxnId } });
    return p ? this.toRef(p) : null;
  }

  async findStalePending(olderThanSec: number): Promise<PaymentRef[]> {
    const cutoff = new Date(Date.now() - olderThanSec * 1000);
    const rows = await this.prisma.admin.payment.findMany({
      where: { status: 'pending', createdAt: { lt: cutoff } },
      take: 100,
    });
    return rows.map((p) => this.toRef(p));
  }

  private toRef(p: Row): PaymentRef {
    return {
      id: p.id,
      tenantId: p.tenantId,
      bookingId: p.bookingId,
      gateway: p.gateway as GatewayKey,
      amount: p.amount,
      status: p.status,
      gatewayTxnId: p.gatewayTxnId,
    };
  }
}
