import type { NotificationTargetType } from '@booking/contracts';
import { dashboardPaths } from '~/constants/paths';

/**
 * The ONLY place a stored target becomes a URL. Rows store `target_type` +
 * `target_id` rather than a path so a route rename cannot silently 404 every
 * notification written in the last 90 days — renaming a route here fixes the
 * history too.
 *
 * An unrecognised type (a row written by a newer API than this deployed
 * dashboard) returns null; the caller renders the item unclickable rather than
 * throwing inside the shell.
 */
export function notificationTargetPath(
  targetType: NotificationTargetType,
  targetId: string | null,
): string | null {
  switch (targetType) {
    case 'tenant_partner':
      return targetId ? dashboardPaths.tenant.partner(targetId) : dashboardPaths.tenant.partners;
    case 'tenant_listing_review':
      return targetId ? dashboardPaths.tenant.listingReview(targetId) : dashboardPaths.tenant.listings;
    case 'tenant_listing_group_review':
      return targetId
        ? dashboardPaths.tenant.listingGroupReview(targetId)
        : dashboardPaths.tenant.listingGroups;
    case 'tenant_disputes':
      return dashboardPaths.tenant.disputes;
    case 'tenant_reviews':
      return dashboardPaths.tenant.reviews;
    case 'tenant_affiliate':
      return targetId ? dashboardPaths.tenant.affiliate(targetId) : dashboardPaths.tenant.affiliates;
    case 'partner_booking':
      return targetId ? dashboardPaths.partner.booking(targetId) : dashboardPaths.partner.bookings;
    case 'partner_listings':
      return dashboardPaths.partner.listings;
    case 'partner_revenue':
      return dashboardPaths.partner.revenue;
    case 'partner_profile':
      return dashboardPaths.partner.profile;
    case 'partner_home':
      return dashboardPaths.partner.home;
    case 'affiliate_home':
      return dashboardPaths.affiliate.home;
    default:
      return null;
  }
}
