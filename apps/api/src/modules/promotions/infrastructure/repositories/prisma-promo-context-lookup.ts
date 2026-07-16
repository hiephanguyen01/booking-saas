import { Injectable } from '@nestjs/common';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { PromoAppliesTo } from '../../domain/promotion-discount';
import type {
  CustomerIdentity,
  IPromoContextLookup,
  ListingScope,
  PromoCategory,
} from '../../domain/ports/promo-context-lookup.port';

/** Bookings that never became a real commitment don't count as a prior booking (§12.2). */
const NON_COMMITTED = ['draft', 'expired', 'rejected'] as const;

@Injectable()
export class PrismaPromoContextLookup implements IPromoContextLookup {
  async getListingScope(tx: PrismaTx, listingId: string): Promise<ListingScope | null> {
    const listing = await tx.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        listingTypeId: true,
        groupId: true,
        categoryId: true,
        partnerId: true,
        resource: { select: { timezone: true } },
      },
    });
    if (!listing) return null;
    return {
      listingId: listing.id,
      listingTypeId: listing.listingTypeId,
      groupId: listing.groupId,
      categoryId: listing.categoryId,
      partnerId: listing.partnerId,
      timezone: listing.resource.timezone,
    };
  }

  async countPriorBookings(tx: PrismaTx, identity: CustomerIdentity): Promise<number> {
    const email = identity.email?.trim() || null;
    const phone = identity.phone?.trim() || null;

    // Resolve every user id that is the same person (guest checkout reuses email/phone, §8.6).
    const orIdentity: { id?: string; email?: string; phone?: string }[] = [{ id: identity.customerId }];
    if (email) orIdentity.push({ email });
    if (phone) orIdentity.push({ phone });
    const users = await tx.user.findMany({ where: { OR: orIdentity }, select: { id: true } });
    const userIds = users.map((u) => u.id);
    if (userIds.length === 0) return 0;

    return tx.booking.count({
      where: { customerId: { in: userIds }, status: { notIn: [...NON_COMMITTED] } },
    });
  }

  /**
   * Every branch looks the id up in the table that the declared scope names, so a
   * cross-type id (a category uuid submitted as a `listing` scope) finds nothing and
   * yields `null`. Each read runs inside the caller's tenant tx, so RLS also makes a
   * *cross-tenant* id resolve to `null` — a promotion can never be scoped outside
   * its own tenant.
   */
  async resolveScopeTargetLabel(tx: PrismaTx, appliesTo: PromoAppliesTo, id: string): Promise<string | null> {
    switch (appliesTo) {
      case 'all':
        return null; // no target to resolve
      case 'listing': {
        const row = await tx.listing.findUnique({ where: { id }, select: { title: true } });
        return row?.title ?? null;
      }
      case 'listing_group': {
        const row = await tx.listingGroup.findUnique({ where: { id }, select: { title: true } });
        return row?.title ?? null;
      }
      case 'listing_type': {
        const row = await tx.listingType.findUnique({ where: { id }, select: { name: true } });
        return row?.name ?? null;
      }
      case 'category': {
        const row = await tx.category.findUnique({ where: { id }, select: { name: true } });
        return row?.name ?? null;
      }
      case 'partner': {
        const row = await tx.partner.findUnique({ where: { id }, select: { name: true } });
        return row?.name ?? null;
      }
      default:
        return null;
    }
  }

  async getPartnerName(tx: PrismaTx, partnerId: string): Promise<string | null> {
    const row = await tx.partner.findUnique({ where: { id: partnerId }, select: { name: true } });
    return row?.name ?? null;
  }

  async listCategories(tx: PrismaTx): Promise<PromoCategory[]> {
    return tx.category.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: { name: 'asc' },
    });
  }
}
