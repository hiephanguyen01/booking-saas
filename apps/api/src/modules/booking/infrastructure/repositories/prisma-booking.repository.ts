import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { attributeFieldSchema, type BookingStatus } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import { pageOffset, type RepoPage } from '../../../../shared/pagination/pagination';
import type {
  BookingRecord,
  BookingStatusHistoryRecord,
  FulfillmentGuard,
  FulfillmentPatch,
  IBookingRepository,
  InsertBookingData,
  PartnerBookingStat,
  PartnerCalendarBooking,
  PartnerCalendarFilters,
  RefundIntentParams,
  TenantBookingFilters,
  TransitionParams,
} from '../../domain/ports/booking-repository.port';
import { IdempotencyConflictError, SlotTakenError } from '../../domain/booking-errors';
import { BookingStateChanged } from '../../domain/errors/booking-domain-errors';
import { parseBookingListingSnapshot } from '../../domain/booking-listing-snapshot';

interface Row {
  id: string;
  tenantId: string;
  listingId: string;
  listingTitle: string;
  listingSlug: string;
  listingDescription: string | null;
  listingImageUrl: string | null;
  listingAttributes: unknown;
  listingAttributeSchema: unknown;
  listingCapacity: number | null;
  listingGroupTitle: string | null;
  listingGroupSlug: string | null;
  listingSnapshot: unknown;
  partnerId: string;
  partnerName: string;
  resourceId: string;
  resourceName: string;
  resourceTimezone: string;
  customerId: string;
  customerFullName: string;
  customerPhone: string | null;
  customerEmail: string;
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
  refundDueAmount: bigint | null;
  refundPercent: number | null;
  securityDeposit: bigint;
  pickedUpAt: Date | null;
  returnedAt: Date | null;
  damageAmount: bigint;
  additionalCharges: unknown;
  cancellationPolicyId: string | null;
  cancellationPolicySnapshot: unknown;
  promotionId: string | null;
  promoCode: string | null;
  promotionSnapshot: unknown;
  commissionSnapshot: unknown;
  pricingSnapshot: unknown;
  affiliateId: string | null;
  referralCode: string | null;
  customerNote: string | null;
  partnerNote: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Every booking read joins the customer (`users`) and the listing title —
 * both appear on every booking surface. Notes on the joins:
 *  - `users` is a global table with NO RLS policy, so the join is unaffected by
 *    the `app.tenant_id` GUC; `listings` IS tenant-scoped, and the booking's
 *    listing is always in the same tenant, so RLS never hides it.
 *  - Both are INNER joins: `customer_id`/`listing_id` are non-null FKs that
 *    Postgres will not let you delete out from under a booking.
 *  - Aliased `b` — `id`/`code` would otherwise be ambiguous across the three
 *    tables. EVERY caller must qualify its WHERE/ORDER BY with `b.`.
 */
const SELECT = Prisma.sql`
  SELECT b.id,
         b.tenant_id AS "tenantId", b.listing_id AS "listingId", l.title AS "listingTitle",
         l.slug AS "listingSlug",
         l.description AS "listingDescription",
         COALESCE(
           b.pricing_snapshot #>> '{selectedPackage,photos,0}',
           CASE
             WHEN b.listing_snapshot IS NULL THEN l.photos->>0
             ELSE b.listing_snapshot #>> '{photos,0}'
           END
         ) AS "listingImageUrl",
         l.attributes AS "listingAttributes",
         lt.attribute_schema AS "listingAttributeSchema",
         l.capacity AS "listingCapacity",
         lg.title AS "listingGroupTitle",
         lg.slug AS "listingGroupSlug",
         b.listing_snapshot AS "listingSnapshot",
         b.partner_id AS "partnerId", p.name AS "partnerName",
         b.resource_id AS "resourceId", r.name AS "resourceName",
         r.timezone AS "resourceTimezone", b.customer_id AS "customerId",
         u.full_name AS "customerFullName", u.phone AS "customerPhone", u.email::text AS "customerEmail",
         b.code, b.idempotency_key AS "idempotencyKey",
         b.booking_mode::text AS "bookingMode", b.status::text AS "status",
         lower(b.timeslot) AS "startUtc", upper(b.timeslot) AS "endUtc",
         b.guest_count AS "guestCount", b.quantity,
         b.total_amount AS "totalAmount", b.discount_amount AS "discountAmount",
         b.final_amount AS "finalAmount", b.deposit_amount AS "depositAmount", b.paid_amount AS "paidAmount",
         b.refund_due_amount AS "refundDueAmount", b.refund_percent AS "refundPercent",
         b.security_deposit AS "securityDeposit", b.picked_up_at AS "pickedUpAt",
         b.returned_at AS "returnedAt", b.damage_amount AS "damageAmount",
         b.additional_charges AS "additionalCharges",
         b.cancellation_policy_id AS "cancellationPolicyId",
         b.cancellation_policy_snapshot AS "cancellationPolicySnapshot",
         b.promotion_id AS "promotionId", b.promo_code AS "promoCode",
         b.promotion_snapshot AS "promotionSnapshot",
         b.commission_snapshot AS "commissionSnapshot",
         b.pricing_snapshot AS "pricingSnapshot",
         b.affiliate_id AS "affiliateId", b.referral_code AS "referralCode",
         b.customer_note AS "customerNote", b.partner_note AS "partnerNote",
         b.expires_at AS "expiresAt", b.created_at AS "createdAt", b.updated_at AS "updatedAt"
  FROM bookings b
  JOIN users u ON u.id = b.customer_id
  JOIN listings l ON l.id = b.listing_id
  JOIN listing_types lt ON lt.id = l.listing_type_id
  LEFT JOIN listing_groups lg ON lg.id = l.group_id
  JOIN partners p ON p.id = b.partner_id
  JOIN resources r ON r.id = b.resource_id`;

function toRecord(r: Row): BookingRecord {
  const {
    customerFullName,
    customerPhone,
    customerEmail,
    listingGroupTitle,
    listingGroupSlug,
    ...rest
  } = r;
  const snapshot = parseBookingListingSnapshot(r.listingSnapshot);
  const liveAttributeSchema = attributeFieldSchema.array().safeParse(r.listingAttributeSchema);
  return {
    ...rest,
    listingTitle: snapshot?.title ?? r.listingTitle,
    listingSlug: snapshot?.slug ?? r.listingSlug,
    listingDescription: snapshot ? snapshot.description : r.listingDescription,
    listingAttributes: snapshot?.attributes ?? r.listingAttributes,
    listingAttributeSchema:
      snapshot?.attributeSchema ?? (liveAttributeSchema.success ? liveAttributeSchema.data : []),
    listingCapacity: snapshot ? snapshot.capacity : r.listingCapacity,
    listingGroup: snapshot
      ? snapshot.group
      : listingGroupTitle && listingGroupSlug
        ? { title: listingGroupTitle, slug: listingGroupSlug }
        : null,
    listingSnapshot: snapshot ?? {
      title: r.listingTitle,
      slug: r.listingSlug,
      description: r.listingDescription,
      photos: r.listingImageUrl ? [r.listingImageUrl] : [],
      attributes:
        r.listingAttributes &&
        typeof r.listingAttributes === 'object' &&
        !Array.isArray(r.listingAttributes)
          ? (r.listingAttributes as Record<string, unknown>)
          : {},
      attributeSchema: liveAttributeSchema.success ? liveAttributeSchema.data : [],
      capacity: r.listingCapacity,
      group:
        listingGroupTitle && listingGroupSlug
          ? { title: listingGroupTitle, slug: listingGroupSlug }
          : null,
    },
    status: r.status as BookingStatus,
    customer: {
      id: r.customerId,
      fullName: customerFullName,
      phone: customerPhone,
      email: customerEmail,
    },
  };
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
    (msg.includes('23505') || msg.includes('duplicate key')) && msg.includes('idempotency_key')
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
        cancellation_policy_id, cancellation_policy_snapshot, pricing_snapshot, listing_snapshot,
        customer_note, updated_at
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
        ${JSON.stringify(data.pricingSnapshot ?? null)}::jsonb,
        ${JSON.stringify(data.listingSnapshot)}::jsonb,
        ${data.customerNote}, now()
      )`);
    } catch (err) {
      // A concurrent request with the same idempotency key won the race — the
      // use case will re-read and return the winning booking (idempotent).
      if (isIdempotencyViolation(err)) throw new IdempotencyConflictError();
      throw err;
    }
    return this.byId(tx, id);
  }

  /**
   * Add a balance payment to `paid_amount` in ONE guarded statement (§8.3).
   *
   * The `paid_amount + $amount <= final_amount` predicate is what makes this safe
   * under at-least-once outbox delivery: the first delivery brings the booking to
   * exactly `final_amount`, so a redelivery would overshoot, matches no row, and
   * silently no-ops. A read-modify-write would double-count instead.
   */
  async addPaidAmount(tx: PrismaTx, bookingId: string, amount: bigint): Promise<void> {
    await tx.$executeRaw(Prisma.sql`
      UPDATE bookings
         SET paid_amount = paid_amount + ${amount}, updated_at = now()
       WHERE id = ${bookingId}::uuid
         AND paid_amount + ${amount} <= final_amount`);
  }

  async applyTransition(tx: PrismaTx, params: TransitionParams): Promise<BookingRecord> {
    const sets = [
      Prisma.sql`status = ${params.to}::booking_status`,
      Prisma.sql`updated_at = now()`,
    ];
    if (params.expiresAt !== undefined) sets.push(Prisma.sql`expires_at = ${params.expiresAt}`);
    if (params.paidAmount !== undefined) sets.push(Prisma.sql`paid_amount = ${params.paidAmount}`);
    if (params.refundDueAmount !== undefined)
      sets.push(Prisma.sql`refund_due_amount = ${params.refundDueAmount}`);
    if (params.refundPercent !== undefined)
      sets.push(Prisma.sql`refund_percent = ${params.refundPercent}`);

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
      throw new BookingStateChanged();
    }

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO booking_status_history (id, tenant_id, booking_id, from_status, to_status, actor_id, reason)
      SELECT ${randomUUID()}::uuid, tenant_id, ${params.id}::uuid,
             ${params.from}::booking_status, ${params.to}::booking_status,
             ${params.actorId ?? null}::uuid, ${params.reason ?? null}
      FROM bookings WHERE id = ${params.id}::uuid`);

    return this.byId(tx, params.id);
  }

  async recordRefundIntent(tx: PrismaTx, params: RefundIntentParams): Promise<BookingRecord> {
    const affected = await tx.$executeRaw(Prisma.sql`
      UPDATE bookings
         SET refund_due_amount = ${params.refundDueAmount},
             refund_percent = ${params.refundPercent},
             updated_at = now()
       WHERE id = ${params.id}::uuid
         AND status = ${params.expectedStatus}::booking_status`);
    if (affected === 0) throw new BookingStateChanged();
    return this.byId(tx, params.id);
  }

  async findById(tx: PrismaTx, id: string): Promise<BookingRecord | null> {
    const rows = await tx.$queryRaw<Row[]>(Prisma.sql`${SELECT} WHERE b.id = ${id}::uuid`);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async findByCode(tx: PrismaTx, code: string): Promise<BookingRecord | null> {
    const rows = await tx.$queryRaw<Row[]>(Prisma.sql`${SELECT} WHERE b.code = ${code}`);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async findByIdempotencyKey(tx: PrismaTx, key: string): Promise<BookingRecord | null> {
    const rows = await tx.$queryRaw<Row[]>(Prisma.sql`${SELECT} WHERE b.idempotency_key = ${key}`);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async listByCustomer(tx: PrismaTx, customerId: string): Promise<BookingRecord[]> {
    const rows = await tx.$queryRaw<Row[]>(
      Prisma.sql`${SELECT} WHERE b.customer_id = ${customerId}::uuid ORDER BY b.created_at DESC`,
    );
    return rows.map(toRecord);
  }

  async listForPartnerCalendar(
    tx: PrismaTx,
    partnerId: string,
    filters: PartnerCalendarFilters,
  ): Promise<PartnerCalendarBooking[]> {
    const conds: Prisma.Sql[] = [
      Prisma.sql`b.partner_id = ${partnerId}::uuid`,
      Prisma.sql`b.status NOT IN ('draft', 'expired')`,
    ];
    // Timeslot window (the partner date semantics): overlap when both bounds are
    // given (the calendar/home feeds always pass a window); open-ended otherwise.
    if (filters.from && filters.to) {
      conds.push(Prisma.sql`b.timeslot && tstzrange(${filters.from}, ${filters.to}, '[)')`);
    } else if (filters.from) {
      conds.push(Prisma.sql`upper(b.timeslot) > ${filters.from}`);
    } else if (filters.to) {
      conds.push(Prisma.sql`lower(b.timeslot) < ${filters.to}`);
    }
    if (filters.status) conds.push(Prisma.sql`b.status = ${filters.status}::booking_status`);
    if (filters.q) {
      const pattern = `%${filters.q}%`;
      conds.push(
        Prisma.sql`(b.code ILIKE ${pattern} OR u.full_name ILIKE ${pattern} OR u.email::text ILIKE ${pattern})`,
      );
    }
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
        resourceTimezone: string;
        bookingMode: string;
        startUtc: Date;
        endUtc: Date;
        guestCount: number;
        quantity: number;
        customerId: string;
        customerFullName: string;
        customerPhone: string | null;
        customerEmail: string;
        finalAmount: bigint;
        discountAmount: bigint;
        depositAmount: bigint;
        paidAmount: bigint;
        additionalCharges: unknown;
        securityDeposit: bigint;
        pickedUpAt: Date | null;
        returnedAt: Date | null;
        customerNote: string | null;
        expiresAt: Date | null;
        createdAt: Date;
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
             r.timezone AS "resourceTimezone",
             b.booking_mode::text AS "bookingMode",
             lower(b.timeslot) AS "startUtc",
             upper(b.timeslot) AS "endUtc",
             b.guest_count AS "guestCount",
             b.quantity,
             b.customer_id AS "customerId",
             u.full_name AS "customerFullName",
             u.phone AS "customerPhone",
             u.email::text AS "customerEmail",
             b.final_amount AS "finalAmount",
             b.discount_amount AS "discountAmount",
             b.deposit_amount AS "depositAmount",
             b.paid_amount AS "paidAmount",
             b.additional_charges AS "additionalCharges",
             b.security_deposit AS "securityDeposit",
             b.picked_up_at AS "pickedUpAt",
             b.returned_at AS "returnedAt",
             b.customer_note AS "customerNote",
             b.expires_at AS "expiresAt",
             b.created_at AS "createdAt"
      FROM bookings b
      JOIN listings l ON l.id = b.listing_id
      JOIN listing_types lt ON lt.id = l.listing_type_id
      JOIN resources r ON r.id = b.resource_id
      JOIN users u ON u.id = b.customer_id
      WHERE ${Prisma.join(conds, ' AND ')}
      ORDER BY lower(b.timeslot) ASC`);
    return rows.map(({ customerId, customerFullName, customerPhone, customerEmail, ...r }) => ({
      ...r,
      status: r.status as BookingStatus,
      customer: {
        id: customerId,
        fullName: customerFullName,
        phone: customerPhone,
        email: customerEmail,
      },
    }));
  }

  async listByTenant(
    tx: PrismaTx,
    filters: TenantBookingFilters,
  ): Promise<RepoPage<BookingRecord>> {
    const conds: Prisma.Sql[] = [];
    if (filters.status) conds.push(Prisma.sql`b.status = ${filters.status}::booking_status`);
    if (filters.partnerId) conds.push(Prisma.sql`b.partner_id = ${filters.partnerId}::uuid`);
    // Search reaches the booking's own code + the customer joined from `users`
    // (`u`) — both are already joined by SELECT and the COUNT below.
    if (filters.q) {
      const pattern = `%${filters.q}%`;
      conds.push(
        Prisma.sql`(b.code ILIKE ${pattern} OR u.full_name ILIKE ${pattern} OR u.email::text ILIKE ${pattern})`,
      );
    }
    if (filters.from) conds.push(Prisma.sql`b.created_at >= ${new Date(filters.from)}`);
    if (filters.to) conds.push(Prisma.sql`b.created_at <= ${new Date(filters.to)}`);
    const where = conds.length ? Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}` : Prisma.empty;
    const { skip, take } = pageOffset(filters);
    // COUNT over the SAME joins + WHERE as SELECT so `total` filters identically.
    const [rows, counted] = await Promise.all([
      tx.$queryRaw<Row[]>(
        Prisma.sql`${SELECT} ${where} ORDER BY b.created_at DESC LIMIT ${take} OFFSET ${skip}`,
      ),
      tx.$queryRaw<{ total: bigint }[]>(Prisma.sql`
        SELECT COUNT(*)::bigint AS total
        FROM bookings b
        JOIN users u ON u.id = b.customer_id
        JOIN listings l ON l.id = b.listing_id
        ${where}`),
    ]);
    return { items: rows.map(toRecord), total: Number(counted[0]?.total ?? 0n) };
  }

  async listStatusHistory(tx: PrismaTx, bookingId: string): Promise<BookingStatusHistoryRecord[]> {
    // LEFT JOIN: actor_id is null for system transitions (expiry, auto-complete).
    const rows = await tx.$queryRaw<
      {
        id: string;
        fromStatus: string | null;
        toStatus: string;
        actorId: string | null;
        actorName: string | null;
        reason: string | null;
        createdAt: Date;
      }[]
    >(Prisma.sql`
      SELECT h.id,
             h.from_status::text AS "fromStatus",
             h.to_status::text AS "toStatus",
             h.actor_id AS "actorId",
             u.full_name AS "actorName",
             h.reason,
             h.created_at AS "createdAt"
      FROM booking_status_history h
      LEFT JOIN users u ON u.id = h.actor_id
      WHERE h.booking_id = ${bookingId}::uuid
      ORDER BY h.created_at ASC`);
    return rows.map((r) => ({
      ...r,
      fromStatus: r.fromStatus as BookingStatus | null,
      toStatus: r.toStatus as BookingStatus,
    }));
  }

  async updatePartnerNote(tx: PrismaTx, id: string, note: string | null): Promise<BookingRecord> {
    await tx.$executeRaw(Prisma.sql`
      UPDATE bookings SET partner_note = ${note}, updated_at = now()
      WHERE id = ${id}::uuid`);
    return this.byId(tx, id);
  }

  async partnerBookingStats(tx: PrismaTx): Promise<PartnerBookingStat[]> {
    const rows = await tx.$queryRaw<
      {
        partnerId: string;
        total: number;
        cancelled: number;
        noShow: number;
        completed: number;
        confirmed: number;
      }[]
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

  async lockAndCountInventory(
    tx: PrismaTx,
    listingId: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    // Serialise concurrent inventory bookings for this listing until commit (§9.4).
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('inv:' || ${listingId}))`,
    );
    return this.countInventoryUsage(tx, listingId, from, to);
  }

  async countInventoryUsage(
    tx: PrismaTx,
    listingId: string,
    from: Date,
    to: Date,
  ): Promise<number> {
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

  async patchFulfillment(
    tx: PrismaTx,
    id: string,
    patch: FulfillmentPatch,
    guard: FulfillmentGuard,
  ): Promise<BookingRecord> {
    const sets = [Prisma.sql`updated_at = now()`];
    if (patch.pickedUpAt !== undefined) sets.push(Prisma.sql`picked_up_at = ${patch.pickedUpAt}`);
    if (patch.returnedAt !== undefined) sets.push(Prisma.sql`returned_at = ${patch.returnedAt}`);
    if (patch.damageAmount !== undefined)
      sets.push(Prisma.sql`damage_amount = ${patch.damageAmount}`);
    if (patch.additionalCharges !== undefined) {
      sets.push(Prisma.sql`additional_charges = ${JSON.stringify(patch.additionalCharges)}::jsonb`);
    }
    const unsetMarker =
      guard.unsetMarker === 'pickedUpAt'
        ? Prisma.sql`picked_up_at IS NULL`
        : Prisma.sql`returned_at IS NULL`;
    const affected = await tx.$executeRaw(Prisma.sql`
      UPDATE bookings
      SET ${Prisma.join(sets)}
      WHERE id = ${id}::uuid
        AND status = ${guard.expectedStatus}::booking_status
        AND ${unsetMarker}`);
    if (affected === 0) throw new BookingStateChanged();
    return this.byId(tx, id);
  }

  private async byId(tx: PrismaTx, id: string): Promise<BookingRecord> {
    const record = await this.findById(tx, id);
    if (!record) throw new Error(`Booking ${id} vanished mid-transaction`);
    return record;
  }
}
