import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { BookingStatus } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  BookingRecord,
  FulfillmentPatch,
  IBookingRepository,
  InsertBookingData,
  PartnerBookingStat,
  PartnerCalendarBooking,
  TenantBookingFilters,
  TransitionParams,
} from '../../domain/ports/booking-repository.port';
import { IdempotencyConflictError, SlotTakenError } from '../../domain/booking-errors';

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
  securityDeposit: bigint;
  pickedUpAt: Date | null;
  returnedAt: Date | null;
  damageAmount: bigint;
  cancellationPolicyId: string | null;
  cancellationPolicySnapshot: unknown;
  promotionId: string | null;
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
         security_deposit AS "securityDeposit", picked_up_at AS "pickedUpAt",
         returned_at AS "returnedAt", damage_amount AS "damageAmount",
         cancellation_policy_id AS "cancellationPolicyId",
         cancellation_policy_snapshot AS "cancellationPolicySnapshot",
         promotion_id AS "promotionId",
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

/** A unique-violation (23505) on the (tenant_id, idempotency_key) index. */
function isIdempotencyViolation(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    (msg.includes('23505') || msg.includes('duplicate key')) &&
    msg.includes('idempotency_key')
  );
}

@Injectable()
export class PrismaBookingRepository implements IBookingRepository {
  async insertDraft(
    tx: PrismaTx,
    tenantId: string,
    data: InsertBookingData,
  ): Promise<BookingRecord> {
    const id = randomUUID();
    try {
      await tx.$executeRaw(Prisma.sql`
      INSERT INTO bookings (
        id, tenant_id, listing_id, partner_id, resource_id, customer_id, code, idempotency_key,
        booking_mode, status, timeslot, blocked_period,
        guest_count, quantity, total_amount, discount_amount, final_amount, deposit_amount, security_deposit,
        promotion_id, promo_code, promotion_snapshot, commission_snapshot, affiliate_id, referral_code,
        cancellation_policy_id, cancellation_policy_snapshot, pricing_snapshot, customer_note, updated_at
      ) VALUES (
        ${id}::uuid, ${tenantId}::uuid, ${data.listingId}::uuid, ${data.partnerId}::uuid,
        ${data.resourceId}::uuid, ${data.customerId}::uuid, ${data.code}, ${data.idempotencyKey},
        ${data.bookingMode}::booking_mode, 'draft'::booking_status,
        tstzrange(${data.timeslot.start}, ${data.timeslot.end}, '[)'),
        tstzrange(${data.blockedPeriod.start}, ${data.blockedPeriod.end}, '[)'),
        ${data.guestCount}, ${data.quantity}, ${data.totalAmount}, ${data.discountAmount},
        ${data.finalAmount}, ${data.depositAmount}, ${data.securityDeposit},
        ${data.promotionId ?? null}::uuid, ${data.promoCode ?? null},
        ${JSON.stringify(data.promotionSnapshot ?? null)}::jsonb,
        ${JSON.stringify(data.commissionSnapshot ?? null)}::jsonb,
        ${data.affiliateId ?? null}::uuid, ${data.referralCode ?? null},
        ${data.cancellationPolicyId}::uuid,
        ${JSON.stringify(data.cancellationPolicySnapshot ?? null)}::jsonb,
        ${JSON.stringify(data.pricingSnapshot ?? null)}::jsonb, ${data.customerNote}, now()
      )`);
    } catch (err) {
      // A concurrent request with the same idempotency key won the race — the
      // use case will re-read and return the winning booking (idempotent).
      if (isIdempotencyViolation(err)) throw new IdempotencyConflictError();
      throw err;
    }
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

  async listForPartnerCalendar(
    tx: PrismaTx,
    partnerId: string,
    from: Date,
    to: Date,
  ): Promise<PartnerCalendarBooking[]> {
    const rows = await tx.$queryRaw<
      {
        id: string;
        code: string;
        status: string;
        listingId: string;
        listingTitle: string;
        listingTypeId: string;
        listingTypeName: string;
        resourceId: string;
        bookingMode: string;
        startUtc: Date;
        endUtc: Date;
        guestCount: number;
        quantity: number;
        finalAmount: bigint;
        securityDeposit: bigint;
        pickedUpAt: Date | null;
        returnedAt: Date | null;
      }[]
    >(Prisma.sql`
      SELECT b.id,
             b.code,
             b.status::text AS "status",
             b.listing_id AS "listingId",
             l.title AS "listingTitle",
             l.listing_type_id AS "listingTypeId",
             lt.name AS "listingTypeName",
             b.resource_id AS "resourceId",
             b.booking_mode::text AS "bookingMode",
             lower(b.timeslot) AS "startUtc",
             upper(b.timeslot) AS "endUtc",
             b.guest_count AS "guestCount",
             b.quantity,
             b.final_amount AS "finalAmount",
             b.security_deposit AS "securityDeposit",
             b.picked_up_at AS "pickedUpAt",
             b.returned_at AS "returnedAt"
      FROM bookings b
      JOIN listings l ON l.id = b.listing_id
      JOIN listing_types lt ON lt.id = l.listing_type_id
      WHERE b.partner_id = ${partnerId}::uuid
        AND b.status NOT IN ('draft', 'expired')
        AND b.timeslot && tstzrange(${from}, ${to}, '[)')
      ORDER BY lower(b.timeslot) ASC`);
    return rows.map((r) => ({ ...r, status: r.status as BookingStatus }));
  }

  async listByTenant(tx: PrismaTx, filters: TenantBookingFilters): Promise<BookingRecord[]> {
    const conds: Prisma.Sql[] = [];
    if (filters.status) conds.push(Prisma.sql`status = ${filters.status}::booking_status`);
    if (filters.partnerId) conds.push(Prisma.sql`partner_id = ${filters.partnerId}::uuid`);
    const where = conds.length ? Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}` : Prisma.empty;
    const limit = Math.min(Math.max(filters.limit ?? 100, 1), 200);
    const rows = await tx.$queryRaw<Row[]>(
      Prisma.sql`${SELECT} ${where} ORDER BY created_at DESC LIMIT ${limit}`,
    );
    return rows.map(toRecord);
  }

  async partnerBookingStats(tx: PrismaTx): Promise<PartnerBookingStat[]> {
    const rows = await tx.$queryRaw<
      { partnerId: string; total: number; cancelled: number; noShow: number; completed: number; confirmed: number }[]
    >(Prisma.sql`
      SELECT partner_id AS "partnerId",
             COUNT(*)::int AS "total",
             COUNT(*) FILTER (WHERE status = 'cancelled')::int AS "cancelled",
             COUNT(*) FILTER (WHERE status = 'no_show')::int AS "noShow",
             COUNT(*) FILTER (WHERE status = 'completed')::int AS "completed",
             COUNT(*) FILTER (WHERE status IN ('confirmed', 'completed'))::int AS "confirmed"
      FROM bookings
      GROUP BY partner_id
      ORDER BY COUNT(*) DESC`);
    return rows;
  }

  async lockAndCountInventory(tx: PrismaTx, listingId: string, from: Date, to: Date): Promise<number> {
    // Serialise concurrent inventory bookings for this listing until commit (§9.4).
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('inv:' || ${listingId}))`);
    return this.countInventoryUsage(tx, listingId, from, to);
  }

  async countInventoryUsage(tx: PrismaTx, listingId: string, from: Date, to: Date): Promise<number> {
    const rows = await tx.$queryRaw<{ used: number }[]>(Prisma.sql`
      SELECT COALESCE(SUM(quantity), 0)::int AS "used"
      FROM bookings
      WHERE listing_id = ${listingId}::uuid
        AND booking_mode = 'inventory'
        AND status IN ('pending_payment', 'pending_approval', 'confirmed')
        AND returned_at IS NULL
        AND (blocked_period && tstzrange(${from}, ${to}, '[)') OR upper(blocked_period) <= now())`);
    return rows[0]?.used ?? 0;
  }

  async patchFulfillment(tx: PrismaTx, id: string, patch: FulfillmentPatch): Promise<BookingRecord> {
    const sets = [Prisma.sql`updated_at = now()`];
    if (patch.pickedUpAt !== undefined) sets.push(Prisma.sql`picked_up_at = ${patch.pickedUpAt}`);
    if (patch.returnedAt !== undefined) sets.push(Prisma.sql`returned_at = ${patch.returnedAt}`);
    if (patch.damageAmount !== undefined) sets.push(Prisma.sql`damage_amount = ${patch.damageAmount}`);
    if (patch.additionalCharges !== undefined) {
      sets.push(Prisma.sql`additional_charges = ${JSON.stringify(patch.additionalCharges)}::jsonb`);
    }
    await tx.$executeRaw(Prisma.sql`UPDATE bookings SET ${Prisma.join(sets)} WHERE id = ${id}::uuid`);
    return this.byId(tx, id);
  }

  private async byId(tx: PrismaTx, id: string): Promise<BookingRecord> {
    const record = await this.findById(tx, id);
    if (!record) throw new Error(`Booking ${id} vanished mid-transaction`);
    return record;
  }
}
