import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  partnerContactInfoResponseSchema,
  themeConfigSchema,
} from '@booking/contracts';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import type { PrismaTx } from '../../../shared/tenant-context/tenant-db.service';
import type {
  BookingNotificationContext,
  INotificationReader,
  ListingNotificationContext,
  NotificationRecipient,
  PartnerNotificationContext,
} from '../domain/ports/notification-reader.port';
import type { SubjectKind } from '../domain/tenant-notification-plan';

interface BookingRow {
  code: string;
  status: string;
  final_amount: bigint;
  customer_id: string;
  partner_id: string;
  start_utc: Date | null;
  end_utc: Date | null;
  listing_title: string;
  listing_image_url: string | null;
  listing_address: string | null;
  timezone: string;
  partner_name: string;
  partner_contact_info: unknown;
  booking_mode: string;
  quantity: number;
  tenant_name: string;
  theme_config: unknown;
  primary_hostname: string | null;
  admin_hostname: string | null;
  total_amount: bigint;
  discount_amount: bigint;
  deposit_amount: bigint;
  paid_amount: bigint;
  refunded_amount: bigint;
  refund_due_amount: bigint | null;
  refund_percent: number | null;
  pricing_snapshot: unknown;
  payment_gateway: string | null;
  payment_method: string | null;
  customer_note: string | null;
  cancellation_policy_snapshot: unknown;
}

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  locale: string;
  phone: string | null;
}

interface TenantBrandRow {
  tenant_name: string;
  theme_config: unknown;
  primary_hostname: string | null;
  admin_hostname: string | null;
}

@Injectable()
export class PrismaNotificationReader implements INotificationReader {
  constructor(private readonly prisma: PrismaService) {}

  async loadBrand(tenantId?: string): Promise<import('../domain/email-template').EmailBrand> {
    if (!tenantId) {
      return {
        name: 'BookingOS',
        primaryColor: '#6941C6',
        dashboardUrl: process.env.DASHBOARD_URL ?? 'http://localhost:5174',
        storefrontUrl: process.env.STOREFRONT_URL ?? 'http://localhost:5173',
        contactEmail: process.env.EMAIL_FROM ?? 'no-reply@bookingos.vn',
      };
    }
    const rows = await this.prisma.admin.$queryRaw<TenantBrandRow[]>(Prisma.sql`
      SELECT t.name AS tenant_name, t.theme_config,
             (SELECT td.hostname FROM tenant_domains td
              WHERE td.tenant_id = t.id AND td.is_primary = true AND td.verified_at IS NOT NULL
                AND td.kind = 'storefront'
              LIMIT 1) AS primary_hostname,
             (SELECT td.hostname FROM tenant_domains td
              WHERE td.tenant_id = t.id AND td.is_primary = true AND td.verified_at IS NOT NULL
                AND td.kind = 'dashboard'
              LIMIT 1) AS admin_hostname
      FROM tenants t
      WHERE t.id = ${tenantId}::uuid
      LIMIT 1`);
    return rows[0] ? this.toBrand(rows[0]) : this.loadBrand();
  }

  async loadBookingContext(tx: PrismaTx, bookingId: string): Promise<BookingNotificationContext | null> {
    const rows = await tx.$queryRaw<BookingRow[]>(Prisma.sql`
      SELECT b.code, b.status::text AS status, b.final_amount, b.total_amount,
             b.discount_amount, b.deposit_amount, b.paid_amount, b.refund_due_amount,
             b.refund_percent, b.pricing_snapshot, b.booking_mode::text AS booking_mode,
             b.quantity,
             b.customer_note, b.cancellation_policy_snapshot, b.customer_id, b.partner_id,
             lower(b.timeslot) AS start_utc, upper(b.timeslot) AS end_utc,
             l.title AS listing_title,
             COALESCE(b.pricing_snapshot #>> '{selectedPackage,photos,0}', l.photos->>0)
               AS listing_image_url,
             l.address AS listing_address, r.timezone AS timezone,
             p.name AS partner_name, p.contact_info AS partner_contact_info,
             t.name AS tenant_name, t.theme_config,
             (SELECT td.hostname FROM tenant_domains td
              WHERE td.tenant_id = t.id AND td.is_primary = true AND td.verified_at IS NOT NULL
                AND td.kind = 'storefront'
              LIMIT 1) AS primary_hostname,
             (SELECT td.hostname FROM tenant_domains td
              WHERE td.tenant_id = t.id AND td.is_primary = true AND td.verified_at IS NOT NULL
                AND td.kind = 'dashboard'
              LIMIT 1) AS admin_hostname,
             refund.refunded_amount,
             payment.gateway AS payment_gateway,
             payment.payment_method
      FROM bookings b
      JOIN listings l ON l.id = b.listing_id
      JOIN resources r ON r.id = b.resource_id
      JOIN partners p ON p.id = b.partner_id
      JOIN tenants t ON t.id = b.tenant_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(rf.amount), 0)::bigint AS refunded_amount
        FROM refunds rf
        WHERE rf.booking_id = b.id AND rf.status = 'succeeded'
      ) refund ON true
      LEFT JOIN LATERAL (
        SELECT pay.gateway::text AS gateway, pay.payment_method
        FROM payments pay
        WHERE pay.booking_id = b.id AND pay.status = 'succeeded'
        ORDER BY pay.paid_at DESC NULLS LAST, pay.created_at DESC
        LIMIT 1
      ) payment ON true
      WHERE b.id = ${bookingId}::uuid`);
    const row = rows[0];
    // A notification must never invent a booking time. Legacy/corrupt rows may
    // still have a null range because Prisma models the unsupported range as nullable.
    if (!row?.start_utc || !row.end_utc) return null;

    const customer = await this.loadUser(tx, row.customer_id);
    const partnerRecipients = await this.loadPartnerMembers(tx, row.partner_id);
    const contact = partnerContactInfoResponseSchema.safeParse(row.partner_contact_info);
    const providerAddress = contact.success
      ? [
          contact.data.address,
          [contact.data.wardType, contact.data.wardName].filter(Boolean).join(' '),
          [contact.data.provinceType, contact.data.provinceName].filter(Boolean).join(' '),
        ].filter(Boolean).join(', ') || null
      : null;
    const brand = this.toBrand({
      tenant_name: row.tenant_name,
      theme_config: row.theme_config,
      primary_hostname: row.primary_hostname,
      admin_hostname: row.admin_hostname,
    });
    return {
      bookingId,
      code: row.code,
      status: row.status,
      listingTitle: row.listing_title,
      listingImageUrl: row.listing_image_url,
      tenantName: row.tenant_name,
      partnerName: row.partner_name,
      providerAddress: providerAddress ?? row.listing_address ?? brand.contactAddress ?? null,
      providerPhone: (contact.success ? contact.data.phone : null) ?? brand.contactPhone ?? null,
      bookingMode: row.booking_mode,
      quantity: row.quantity,
      startUtc: row.start_utc,
      endUtc: row.end_utc,
      timezone: row.timezone,
      listingAddress: row.listing_address,
      totalAmount: row.total_amount,
      finalAmount: row.final_amount,
      discountAmount: row.discount_amount,
      depositAmount: row.deposit_amount,
      paidAmount: row.paid_amount,
      refundedAmount: row.refunded_amount,
      refundDueAmount: row.refund_due_amount,
      refundPercent: row.refund_percent,
      pricingSnapshot: row.pricing_snapshot,
      paymentGateway: row.payment_gateway,
      paymentMethod: row.payment_method,
      customerNote: row.customer_note,
      cancellationPolicySnapshot: row.cancellation_policy_snapshot,
      brand,
      customer,
      partnerRecipients,
    };
  }

  async loadListingContext(tx: PrismaTx, listingId: string): Promise<ListingNotificationContext | null> {
    const rows = await tx.$queryRaw<Array<{ listing_title: string; tenant_name: string; partner_id: string; theme_config: unknown; primary_hostname: string | null; admin_hostname: string | null }>>(Prisma.sql`
      SELECT l.title AS listing_title, t.name AS tenant_name, l.partner_id, t.theme_config,
             (SELECT td.hostname FROM tenant_domains td
              WHERE td.tenant_id = t.id AND td.is_primary = true AND td.verified_at IS NOT NULL
                AND td.kind = 'storefront'
              LIMIT 1) AS primary_hostname,
             (SELECT td.hostname FROM tenant_domains td
              WHERE td.tenant_id = t.id AND td.is_primary = true AND td.verified_at IS NOT NULL
                AND td.kind = 'dashboard'
              LIMIT 1) AS admin_hostname
      FROM listings l JOIN tenants t ON t.id = l.tenant_id
      WHERE l.id = ${listingId}::uuid`);
    const row = rows[0];
    if (!row) return null;
    return {
      listingTitle: row.listing_title,
      tenantName: row.tenant_name,
      brand: this.toBrand(row),
      partnerRecipients: await this.loadPartnerMembers(tx, row.partner_id),
    };
  }

  async loadPartnerContext(tx: PrismaTx, partnerId: string): Promise<PartnerNotificationContext | null> {
    const rows = await tx.$queryRaw<Array<{ partner_name: string; tenant_name: string; theme_config: unknown; primary_hostname: string | null; admin_hostname: string | null }>>(Prisma.sql`
      SELECT p.name AS partner_name, t.name AS tenant_name, t.theme_config,
             (SELECT td.hostname FROM tenant_domains td
              WHERE td.tenant_id = t.id AND td.is_primary = true AND td.verified_at IS NOT NULL
                AND td.kind = 'storefront'
              LIMIT 1) AS primary_hostname,
             (SELECT td.hostname FROM tenant_domains td
              WHERE td.tenant_id = t.id AND td.is_primary = true AND td.verified_at IS NOT NULL
                AND td.kind = 'dashboard'
              LIMIT 1) AS admin_hostname
      FROM partners p JOIN tenants t ON t.id = p.tenant_id
      WHERE p.id = ${partnerId}::uuid`);
    const row = rows[0];
    if (!row) return null;
    return {
      tenantName: row.tenant_name,
      partnerName: row.partner_name,
      brand: this.toBrand(row),
      agreementVersions: await this.loadAgreementVersions(tx, partnerId),
      recipients: await this.loadPartnerMembers(tx, partnerId),
    };
  }

  async loadActivePartnerRecipients(tx: PrismaTx, tenantId: string): Promise<NotificationRecipient[]> {
    const rows = await tx.$queryRaw<UserRow[]>(Prisma.sql`
      SELECT DISTINCT u.id, u.email, u.full_name, u.locale, u.phone
      FROM partners p
      JOIN partner_members pm ON pm.partner_id = p.id
      JOIN users u ON u.id = pm.user_id
      WHERE p.tenant_id = ${tenantId}::uuid AND p.status = 'approved'`);
    return rows.map((u) => this.toRecipient(u));
  }

  async loadActiveAffiliateRecipients(tx: PrismaTx, tenantId: string): Promise<NotificationRecipient[]> {
    const rows = await tx.$queryRaw<UserRow[]>(Prisma.sql`
      SELECT u.id, u.email, u.full_name, u.locale, u.phone
      FROM affiliates a
      JOIN users u ON u.id = a.user_id
      WHERE a.tenant_id = ${tenantId}::uuid AND a.status = 'approved'`);
    return rows.map((u) => this.toRecipient(u));
  }

  async findUpcomingConfirmed(from: Date, to: Date): Promise<Array<{ tenantId: string; bookingId: string }>> {
    const rows = await this.prisma.admin.$queryRaw<{ tenant_id: string; id: string }[]>(Prisma.sql`
      SELECT tenant_id, id FROM bookings
      WHERE status = 'confirmed' AND booking_mode <> 'inventory'
        AND lower(timeslot) >= ${from} AND lower(timeslot) < ${to}
      LIMIT 500`);
    return rows.map((r) => ({ tenantId: r.tenant_id, bookingId: r.id }));
  }

  async loadTenantStaffWithPermission(
    tx: PrismaTx, tenantId: string, permissionKey: string,
  ): Promise<NotificationRecipient[]> {
    // NOTE: `role_permissions` stores the permission key directly
    // (`permission_key`, FK'd to `permissions.key`) — there is no
    // `role_permissions.permission_id`/`permissions.id`, so no join to
    // `permissions` is needed at all.
    const rows = await tx.$queryRaw<UserRow[]>(Prisma.sql`
      SELECT DISTINCT u.id, u.email, u.full_name, u.locale, u.phone
      FROM role_assignments ra
      JOIN role_permissions rp ON rp.role_id = ra.role_id
      JOIN users u ON u.id = ra.user_id
      WHERE ra.tenant_id = ${tenantId}::uuid
        AND ra.partner_id IS NULL
        AND rp.permission_key = ${permissionKey}
        AND u.status = 'active'`);
    return rows.map((u) => this.toRecipient(u));
  }

  async hasTenantMembership(userId: string, tenantId: string): Promise<boolean> {
    const rows = await this.prisma.admin.$queryRaw<{ ok: boolean }[]>(Prisma.sql`
      SELECT (
        EXISTS (SELECT 1 FROM role_assignments
                WHERE user_id = ${userId}::uuid AND tenant_id = ${tenantId}::uuid)
        OR EXISTS (SELECT 1 FROM partner_members
                   WHERE user_id = ${userId}::uuid AND tenant_id = ${tenantId}::uuid)
        OR EXISTS (SELECT 1 FROM affiliates
                   WHERE user_id = ${userId}::uuid AND tenant_id = ${tenantId}::uuid)
      ) AS ok`);
    return rows[0]?.ok === true;
  }

  async loadNotificationSubject(
    tx: PrismaTx, kind: SubjectKind, subjectId: string,
  ): Promise<string | null> {
    const sql = {
      listing_title: Prisma.sql`SELECT title AS s FROM listings WHERE id = ${subjectId}::uuid`,
      listing_group_title: Prisma.sql`SELECT title AS s FROM listing_groups WHERE id = ${subjectId}::uuid`,
      partner_name: Prisma.sql`SELECT name AS s FROM partners WHERE id = ${subjectId}::uuid`,
      booking_code: Prisma.sql`SELECT code AS s FROM bookings WHERE id = ${subjectId}::uuid`,
      affiliate_user_name: Prisma.sql`
        SELECT u.full_name AS s FROM affiliates a
        JOIN users u ON u.id = a.user_id WHERE a.id = ${subjectId}::uuid`,
    }[kind];
    const rows = await tx.$queryRaw<{ s: string | null }[]>(sql);
    return rows[0]?.s ?? null;
  }

  private async loadUser(tx: PrismaTx, userId: string): Promise<NotificationRecipient | null> {
    const rows = await tx.$queryRaw<UserRow[]>(Prisma.sql`
      SELECT id, email, full_name, locale, phone FROM users WHERE id = ${userId}::uuid`);
    const u = rows[0];
    return u ? {
      userId: u.id,
      email: u.email,
      name: u.full_name,
      locale: u.locale,
      ...(u.phone ? { phone: u.phone } : {}),
    } : null;
  }

  private async loadPartnerMembers(tx: PrismaTx, partnerId: string): Promise<NotificationRecipient[]> {
    const rows = await tx.$queryRaw<UserRow[]>(Prisma.sql`
      SELECT u.id, u.email, u.full_name, u.locale, u.phone
      FROM partner_members pm JOIN users u ON u.id = pm.user_id
      WHERE pm.partner_id = ${partnerId}::uuid`);
    return rows.map((u) => this.toRecipient(u));
  }

  private toRecipient(u: UserRow): NotificationRecipient {
    return {
      userId: u.id,
      email: u.email,
      name: u.full_name,
      locale: u.locale,
      ...(u.phone ? { phone: u.phone } : {}),
    };
  }

  private async loadAgreementVersions(tx: PrismaTx, partnerId: string): Promise<string[]> {
    const rows = await tx.$queryRaw<Array<{ agreement_type: string; version: string }>>(Prisma.sql`
      SELECT agreement_type::text AS agreement_type, version
      FROM agreement_acceptances
      WHERE partner_id = ${partnerId}::uuid
      ORDER BY accepted_at DESC`);
    return rows.map((row) => `${row.agreement_type}: ${row.version}`);
  }

  private toBrand(row: TenantBrandRow): import('../domain/email-template').EmailBrand {
    const parsed = themeConfigSchema.safeParse(row.theme_config);
    const theme = parsed.success ? parsed.data : {};
    const primaryColor = theme.colors?.primary ?? '#6941C6';
    return {
      name: row.tenant_name,
      primaryColor,
      ...(theme.logoUrl ? { logoUrl: theme.logoUrl } : {}),
      ...(theme.contact?.email ? { contactEmail: theme.contact.email } : {}),
      ...(theme.contact?.phone ? { contactPhone: theme.contact.phone } : {}),
      ...(theme.contact?.address ? { contactAddress: theme.contact.address } : {}),
      storefrontUrl: this.tenantOrigin(
        row.primary_hostname,
        process.env.STOREFRONT_PORT ?? '5173',
        process.env.STOREFRONT_URL ?? 'http://localhost:5173',
      ),
      dashboardUrl: this.tenantOrigin(
        row.admin_hostname,
        process.env.DASHBOARD_PORT ?? '5174',
        process.env.DASHBOARD_URL ?? 'http://localhost:5174',
      ),
    };
  }

  /**
   * Absolute origin for a tenant-owned hostname. ONE helper for both surfaces:
   * they differ only in the dev port and the platform fallback, so a second copy
   * would only be a place for the two to drift apart.
   *
   * The console origin matters because partner CTAs point at /partner/*, which
   * lives on a tenant console host — the platform console does not serve it.
   */
  private tenantOrigin(hostname: string | null, devPort: string, fallback: string): string {
    if (!hostname) return fallback;
    if (hostname.endsWith('.localhost')) return `http://${hostname}:${devPort}`;
    return `https://${hostname}`;
  }
}
