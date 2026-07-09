import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { BookingStatus } from '@booking/shared';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  BookingRecord,
  IBookingRepository,
  InsertBookingData,
  TransitionParams,
} from '../../domain/ports/booking-repository.port';
import { SlotTakenError } from '../../domain/booking-errors';

interface Row {
  id: string;
  tenantId: string;
  listingId: string;
  partnerId: string;
  resourceId: string;
  customerId: string;
  code: string;
  idempotencyKey: string;
  bookingMode: string;
  status: string;
  startUtc: Date;
  endUtc: Date;
  guestCount: number;
  quantity: number;
  totalAmount: bigint;
  discountAmount: bigint;
  finalAmount: bigint;
  depositAmount: bigint;
  paidAmount: bigint;
  cancellationPolicyId: string | null;
  cancellationPolicySnapshot: unknown;
  customerNote: string | null;
  expiresAt: Date | null;
  createdAt: Date;
}

const SELECT = Prisma.sql`
  SELECT id,
         tenant_id AS "tenantId", listing_id AS "listingId", partner_id AS "partnerId",
         resource_id AS "resourceId", customer_id AS "customerId",
         code, idempotency_key AS "idempotencyKey",
         booking_mode::text AS "bookingMode", status::text AS "status",
         lower(timeslot) AS "startUtc", upper(timeslot) AS "endUtc",
         guest_count AS "guestCount", quantity,
         total_amount AS "totalAmount", discount_amount AS "discountAmount",
         final_amount AS "finalAmount", deposit_amount AS "depositAmount", paid_amount AS "paidAmount",
         cancellation_policy_id AS "cancellationPolicyId",
         cancellation_policy_snapshot AS "cancellationPolicySnapshot",
         customer_note AS "customerNote", expires_at AS "expiresAt", created_at AS "createdAt"
  FROM bookings`;

function toRecord(r: Row): BookingRecord {
  return { ...r, status: r.status as BookingStatus };
}

/** Mentions of the double-booking exclusion constraint in a DB error (§10). */
function isExclusionViolation(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('bookings_no_overlap') || msg.includes('23P01');
}

@Injectable()
export class PrismaBookingRepository implements IBookingRepository {
  async insertDraft(
    tx: PrismaTx,
    tenantId: string,
    data: InsertBookingData,
  ): Promise<BookingRecord> {
    const id = randomUUID();
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO bookings (
        id, tenant_id, listing_id, partner_id, resource_id, customer_id, code, idempotency_key,
        booking_mode, status, timeslot, blocked_period,
        guest_count, quantity, total_amount, discount_amount, final_amount, deposit_amount,
        cancellation_policy_id, cancellation_policy_snapshot, pricing_snapshot, customer_note, updated_at
      ) VALUES (
        ${id}::uuid, ${tenantId}::uuid, ${data.listingId}::uuid, ${data.partnerId}::uuid,
        ${data.resourceId}::uuid, ${data.customerId}::uuid, ${data.code}, ${data.idempotencyKey},
        ${data.bookingMode}::booking_mode, 'draft'::booking_status,
        tstzrange(${data.timeslot.start}, ${data.timeslot.end}, '[)'),
        tstzrange(${data.blockedPeriod.start}, ${data.blockedPeriod.end}, '[)'),
        ${data.guestCount}, ${data.quantity}, ${data.totalAmount}, ${data.discountAmount},
        ${data.finalAmount}, ${data.depositAmount},
        ${data.cancellationPolicyId}::uuid,
        ${JSON.stringify(data.cancellationPolicySnapshot ?? null)}::jsonb,
        ${JSON.stringify(data.pricingSnapshot ?? null)}::jsonb, ${data.customerNote}, now()
      )`);
    return this.byId(tx, id);
  }

  async applyTransition(tx: PrismaTx, params: TransitionParams): Promise<BookingRecord> {
    const sets = [
      Prisma.sql`status = ${params.to}::booking_status`,
      Prisma.sql`updated_at = now()`,
    ];
    if (params.expiresAt !== undefined) sets.push(Prisma.sql`expires_at = ${params.expiresAt}`);
    if (params.paidAmount !== undefined) sets.push(Prisma.sql`paid_amount = ${params.paidAmount}`);

    let affected: number;
    try {
      affected = await tx.$executeRaw(Prisma.sql`
        UPDATE bookings SET ${Prisma.join(sets)}
        WHERE id = ${params.id}::uuid AND status = ${params.from}::booking_status`);
    } catch (err) {
      if (isExclusionViolation(err)) throw new SlotTakenError();
      throw err;
    }
    if (affected === 0) {
      throw new ConflictException({
        statusCode: 409,
        code: 'BOOKING_STATE_CHANGED',
        message: 'The booking is no longer in the expected state',
      });
    }

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO booking_status_history (id, tenant_id, booking_id, from_status, to_status, actor_id, reason)
      SELECT ${randomUUID()}::uuid, tenant_id, ${params.id}::uuid,
             ${params.from}::booking_status, ${params.to}::booking_status,
             ${params.actorId ?? null}::uuid, ${params.reason ?? null}
      FROM bookings WHERE id = ${params.id}::uuid`);

    return this.byId(tx, params.id);
  }

  async findById(tx: PrismaTx, id: string): Promise<BookingRecord | null> {
    const rows = await tx.$queryRaw<Row[]>(Prisma.sql`${SELECT} WHERE id = ${id}::uuid`);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async findByCode(tx: PrismaTx, code: string): Promise<BookingRecord | null> {
    const rows = await tx.$queryRaw<Row[]>(Prisma.sql`${SELECT} WHERE code = ${code}`);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async findByIdempotencyKey(tx: PrismaTx, key: string): Promise<BookingRecord | null> {
    const rows = await tx.$queryRaw<Row[]>(Prisma.sql`${SELECT} WHERE idempotency_key = ${key}`);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async listByCustomer(tx: PrismaTx, customerId: string): Promise<BookingRecord[]> {
    const rows = await tx.$queryRaw<Row[]>(
      Prisma.sql`${SELECT} WHERE customer_id = ${customerId}::uuid ORDER BY created_at DESC`,
    );
    return rows.map(toRecord);
  }

  private async byId(tx: PrismaTx, id: string): Promise<BookingRecord> {
    const record = await this.findById(tx, id);
    if (!record) throw new Error(`Booking ${id} vanished mid-transaction`);
    return record;
  }
}
