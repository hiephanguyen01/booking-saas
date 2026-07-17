import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { BookingMode, ModerationActor } from '@booking/contracts';
import { toStatusCounts } from '../../../../shared/pagination/pagination';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  CreateListingData,
  IListingRepository,
  ListingFilter,
  ListingRecord,
  ModerationUpdate,
  PublicListingRecord,
  UpdateListingData,
} from '../../domain/ports/listing-repository.port';

/**
 * Everything a `ListingRecord` needs beyond the row itself. Applied to EVERY
 * listing query so the record shape is uniform — the response embeds the resolved
 * cancellation policy and the partner summary (§7.3: name + verification only,
 * never partner contact details).
 */
const LISTING_INCLUDE = {
  cancellationPolicy: { select: { id: true, name: true, rules: true } },
  partner: { select: { name: true, verificationStatus: true } },
} as const satisfies Prisma.ListingInclude;

type Row = Prisma.ListingGetPayload<{ include: typeof LISTING_INCLUDE }>;

function toRecord(l: Row): ListingRecord {
  return {
    id: l.id,
    tenantId: l.tenantId,
    partnerId: l.partnerId,
    listingTypeId: l.listingTypeId,
    resourceId: l.resourceId,
    groupId: l.groupId,
    categoryId: l.categoryId,
    title: l.title,
    slug: l.slug,
    description: l.description,
    provinceCode: l.provinceCode,
    provinceName: l.provinceName,
    wardCode: l.wardCode,
    wardName: l.wardName,
    address: l.address,
    photos: (l.photos ?? []) as string[],
    attributes: (l.attributes ?? {}) as Record<string, unknown>,
    bookingModes: l.bookingModes as BookingMode[],
    modeConfig: (l.modeConfig ?? {}) as Record<string, unknown>,
    stockQuantity: l.stockQuantity,
    capacity: l.capacity,
    bufferBefore: l.bufferBefore,
    bufferAfter: l.bufferAfter,
    approvalRequired: l.approvalRequired,
    depositPercent: l.depositPercent,
    balanceDue: l.balanceDue,
    rescheduleAllowed: l.rescheduleAllowed,
    rescheduleDeadlineHours: l.rescheduleDeadlineHours,
    // bigint → digit string; money never crosses a layer as a JS number.
    rescheduleFee: l.rescheduleFee === null ? null : l.rescheduleFee.toString(),
    cancellationPolicyId: l.cancellationPolicyId,
    cancellationPolicy: l.cancellationPolicy,
    partner: l.partner,
    status: l.status,
    publishedBy: l.publishedBy as ModerationActor | null,
    hiddenBy: l.hiddenBy as ModerationActor | null,
    submittedAt: l.submittedAt,
    publishedAt: l.publishedAt,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}

/**
 * Prisma `where` for the shared listing filter, EXCLUDING `status` — so it doubles
 * as the `baseWhere` the per-status counts are grouped over. `listPage` layers the
 * active `status` on top for `items`/`total`.
 */
function toWhere(filter: ListingFilter): Prisma.ListingWhereInput {
  const where: Prisma.ListingWhereInput = {};
  if (filter.groupId) where.groupId = filter.groupId;
  if (filter.partnerId) where.partnerId = filter.partnerId;
  if (filter.q) where.title = { contains: filter.q, mode: 'insensitive' };
  return where;
}

@Injectable()
export class PrismaListingRepository implements IListingRepository {
  async create(tx: PrismaTx, tenantId: string, data: CreateListingData): Promise<ListingRecord> {
    return toRecord(
      await tx.listing.create({
        data: {
          tenantId,
          partnerId: data.partnerId,
          listingTypeId: data.listingTypeId,
          resourceId: data.resourceId,
          groupId: data.groupId ?? null,
          categoryId: data.categoryId ?? null,
          title: data.title,
          slug: data.slug,
          description: data.description ?? null,
          provinceCode: data.provinceCode ?? null,
          provinceName: data.provinceName ?? null,
          wardCode: data.wardCode ?? null,
          wardName: data.wardName ?? null,
          address: data.address ?? null,
          photos: data.photos as Prisma.InputJsonValue,
          attributes: data.attributes as Prisma.InputJsonValue,
          bookingModes: data.bookingModes as never,
          modeConfig: data.modeConfig as Prisma.InputJsonValue,
          stockQuantity: data.stockQuantity ?? null,
          capacity: data.capacity ?? null,
          bufferBefore: data.bufferBefore,
          bufferAfter: data.bufferAfter,
          approvalRequired: data.approvalRequired,
          depositPercent: data.depositPercent,
          balanceDue: data.balanceDue,
          cancellationPolicyId: data.cancellationPolicyId ?? null,
        },
        include: LISTING_INCLUDE,
      }),
    );
  }

  async findById(tx: PrismaTx, id: string): Promise<ListingRecord | null> {
    const l = await tx.listing.findUnique({ where: { id }, include: LISTING_INCLUDE });
    return l ? toRecord(l) : null;
  }

  async findBySlug(tx: PrismaTx, slug: string): Promise<ListingRecord | null> {
    const l = await tx.listing.findFirst({ where: { slug }, include: LISTING_INCLUDE });
    return l ? toRecord(l) : null;
  }

  async findPublicBySlug(tx: PrismaTx, slug: string): Promise<PublicListingRecord | null> {
    const l = await tx.listing.findFirst({
      where: { slug, status: 'published' },
      include: {
        ...LISTING_INCLUDE,
        resource: { select: { timezone: true } },
        listingType: { select: { slug: true } },
        group: { select: { title: true, slug: true, status: true } },
        // Trust signals (§16.1) — partner display name + verification + tenure.
        // Contact info is deliberately NOT selected: it is revealed only after a
        // booking is confirmed (§7.3 anti-disintermediation).
        partner: {
          select: { name: true, verificationStatus: true, verifiedAt: true, createdAt: true },
        },
      },
    });
    if (!l) return null;
    const completedBookings = await tx.booking.count({
      where: { listingId: l.id, status: 'completed' },
    });
    // Avg partner approval response time (§16.1): the gap between a request-to-book
    // booking's creation and its pending_approval → pending_payment transition.
    const approval = await tx.$queryRaw<{ avg_seconds: number | null }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM (h.created_at - b.created_at))) AS avg_seconds
      FROM booking_status_history h
      JOIN bookings b ON b.id = h.booking_id
      WHERE b.listing_id = ${l.id}::uuid
        AND h.from_status = 'pending_approval'
        AND h.to_status = 'pending_payment'
    `;
    const avgSeconds = approval[0]?.avg_seconds;
    return {
      ...toRecord(l),
      resourceTimezone: l.resource.timezone,
      listingTypeSlug: l.listingType.slug,
      group:
        l.group && l.group.status === 'published'
          ? { title: l.group.title, slug: l.group.slug }
          : null,
      partnerName: l.partner.name,
      partnerVerifiedAt: l.partner.verifiedAt,
      partnerActiveSince: l.partner.createdAt,
      completedBookings,
      avgApprovalResponseSeconds:
        avgSeconds === null || avgSeconds === undefined ? null : Math.round(Number(avgSeconds)),
    };
  }

  async list(tx: PrismaTx, filter: ListingFilter): Promise<ListingRecord[]> {
    const items = await tx.listing.findMany({
      where: toWhere(filter),
      orderBy: { createdAt: 'desc' },
      include: LISTING_INCLUDE,
    });
    return items.map(toRecord);
  }

  async listPage(
    tx: PrismaTx,
    filter: ListingFilter,
    page: { page: number; pageSize: number },
  ): Promise<{ items: ListingRecord[]; total: number; counts: Record<string, number> }> {
    // `baseWhere` carries every filter EXCEPT status, so each status tab's count
    // reflects the group/search scope while ignoring the active tab. `items`/`total`
    // use the full `where` (status included) — filtered identically or the pager lies.
    const baseWhere = toWhere(filter);
    const where: Prisma.ListingWhereInput = {
      ...baseWhere,
      ...(filter.status ? { status: filter.status } : {}),
    };
    const [items, total, countRows] = await Promise.all([
      tx.listing.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: LISTING_INCLUDE,
        skip: (page.page - 1) * page.pageSize,
        take: page.pageSize,
      }),
      tx.listing.count({ where }),
      tx.listing.groupBy({ by: ['status'], where: baseWhere, _count: true }),
    ]);
    return { items: items.map(toRecord), total, counts: toStatusCounts(countRows) };
  }

  async update(tx: PrismaTx, id: string, data: UpdateListingData): Promise<ListingRecord> {
    return toRecord(
      await tx.listing.update({
        where: { id },
        data: {
          groupId: data.groupId,
          categoryId: data.categoryId,
          title: data.title,
          slug: data.slug,
          description: data.description,
          provinceCode: data.provinceCode,
          provinceName: data.provinceName,
          wardCode: data.wardCode,
          wardName: data.wardName,
          address: data.address,
          photos: data.photos as Prisma.InputJsonValue | undefined,
          attributes: data.attributes as Prisma.InputJsonValue | undefined,
          bookingModes: data.bookingModes as never,
          modeConfig: data.modeConfig as Prisma.InputJsonValue | undefined,
          stockQuantity: data.stockQuantity,
          capacity: data.capacity,
          bufferBefore: data.bufferBefore,
          bufferAfter: data.bufferAfter,
          approvalRequired: data.approvalRequired,
          depositPercent: data.depositPercent,
          balanceDue: data.balanceDue,
          cancellationPolicyId: data.cancellationPolicyId,
        },
        include: LISTING_INCLUDE,
      }),
    );
  }

  async moderate(tx: PrismaTx, id: string, update: ModerationUpdate): Promise<ListingRecord> {
    return toRecord(
      await tx.listing.update({
        where: { id },
        data: {
          status: update.status,
          publishedBy: update.publishedBy,
          hiddenBy: update.hiddenBy,
          // Undefined = leave as stored (Prisma omits the column from the UPDATE).
          submittedAt: update.submittedAt,
          publishedAt: update.publishedAt,
        },
        include: LISTING_INCLUDE,
      }),
    );
  }

  async delete(tx: PrismaTx, id: string): Promise<void> {
    await tx.listing.delete({ where: { id } });
  }

  countBookings(tx: PrismaTx, listingId: string): Promise<number> {
    return tx.booking.count({ where: { listingId } });
  }
}
