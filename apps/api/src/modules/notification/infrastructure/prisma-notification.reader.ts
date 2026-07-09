import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import type { PrismaTx } from '../../../shared/tenant-context/tenant-db.service';
import type {
  BookingNotificationContext,
  INotificationReader,
  ListingNotificationContext,
  NotificationRecipient,
  PartnerNotificationContext,
} from '../domain/ports/notification-reader.port';

interface BookingRow {
  code: string;
  status: string;
  final_amount: bigint;
  customer_id: string;
  partner_id: string;
  start_utc: Date | null;
  listing_title: string;
  timezone: string;
  partner_name: string;
  tenant_name: string;
}

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  locale: string;
}

@Injectable()
export class PrismaNotificationReader implements INotificationReader {
  constructor(private readonly prisma: PrismaService) {}

  async loadBookingContext(tx: PrismaTx, bookingId: string): Promise<BookingNotificationContext | null> {
    const rows = await tx.$queryRaw<BookingRow[]>(Prisma.sql`
      SELECT b.code, b.status::text AS status, b.final_amount, b.customer_id, b.partner_id,
             lower(b.timeslot) AS start_utc,
             l.title AS listing_title, r.timezone AS timezone,
             p.name AS partner_name, t.name AS tenant_name
      FROM bookings b
      JOIN listings l ON l.id = b.listing_id
      JOIN resources r ON r.id = b.resource_id
      JOIN partners p ON p.id = b.partner_id
      JOIN tenants t ON t.id = b.tenant_id
      WHERE b.id = ${bookingId}::uuid`);
    const row = rows[0];
    if (!row) return null;

    const customer = await this.loadUser(tx, row.customer_id);
    const partnerRecipients = await this.loadPartnerMembers(tx, row.partner_id);
    return {
      bookingId,
      code: row.code,
      status: row.status,
      listingTitle: row.listing_title,
      tenantName: row.tenant_name,
      partnerName: row.partner_name,
      startUtc: row.start_utc ?? new Date(),
      timezone: row.timezone,
      finalAmount: row.final_amount,
      customer,
      partnerRecipients,
    };
  }

  async loadListingContext(tx: PrismaTx, listingId: string): Promise<ListingNotificationContext | null> {
    const rows = await tx.$queryRaw<{ listing_title: string; tenant_name: string; partner_id: string }[]>(Prisma.sql`
      SELECT l.title AS listing_title, t.name AS tenant_name, l.partner_id
      FROM listings l JOIN tenants t ON t.id = l.tenant_id
      WHERE l.id = ${listingId}::uuid`);
    const row = rows[0];
    if (!row) return null;
    return {
      listingTitle: row.listing_title,
      tenantName: row.tenant_name,
      partnerRecipients: await this.loadPartnerMembers(tx, row.partner_id),
    };
  }

  async loadPartnerContext(tx: PrismaTx, partnerId: string): Promise<PartnerNotificationContext | null> {
    const rows = await tx.$queryRaw<{ partner_name: string; tenant_name: string }[]>(Prisma.sql`
      SELECT p.name AS partner_name, t.name AS tenant_name
      FROM partners p JOIN tenants t ON t.id = p.tenant_id
      WHERE p.id = ${partnerId}::uuid`);
    const row = rows[0];
    if (!row) return null;
    return {
      tenantName: row.tenant_name,
      partnerName: row.partner_name,
      recipients: await this.loadPartnerMembers(tx, partnerId),
    };
  }

  async findUpcomingConfirmed(from: Date, to: Date): Promise<Array<{ tenantId: string; bookingId: string }>> {
    const rows = await this.prisma.admin.$queryRaw<{ tenant_id: string; id: string }[]>(Prisma.sql`
      SELECT tenant_id, id FROM bookings
      WHERE status = 'confirmed' AND booking_mode <> 'inventory'
        AND lower(timeslot) >= ${from} AND lower(timeslot) < ${to}
      LIMIT 500`);
    return rows.map((r) => ({ tenantId: r.tenant_id, bookingId: r.id }));
  }

  private async loadUser(tx: PrismaTx, userId: string): Promise<NotificationRecipient | null> {
    const rows = await tx.$queryRaw<UserRow[]>(Prisma.sql`
      SELECT id, email, full_name, locale FROM users WHERE id = ${userId}::uuid`);
    const u = rows[0];
    return u ? { userId: u.id, email: u.email, name: u.full_name, locale: u.locale } : null;
  }

  private async loadPartnerMembers(tx: PrismaTx, partnerId: string): Promise<NotificationRecipient[]> {
    const rows = await tx.$queryRaw<UserRow[]>(Prisma.sql`
      SELECT u.id, u.email, u.full_name, u.locale
      FROM partner_members pm JOIN users u ON u.id = pm.user_id
      WHERE pm.partner_id = ${partnerId}::uuid`);
    return rows.map((u) => ({ userId: u.id, email: u.email, name: u.full_name, locale: u.locale }));
  }
}
