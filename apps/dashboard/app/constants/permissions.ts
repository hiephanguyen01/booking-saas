import type { PartnerPermissionKey, TenantPermissionKey } from '@booking/contracts';

/** Vietnamese label per permission key. Keyed by the contracts enum, so a new
 *  key in the catalog fails typecheck here until it is given a label. */
export const TENANT_PERMISSION_LABELS: Record<TenantPermissionKey, string> = {
  'tenant.settings.manage': 'Quản lý cài đặt',
  'tenant.legal.manage': 'Quản lý pháp lý',
  'tenant.theme.manage': 'Tùy chỉnh giao diện',
  'tenant.partners.read': 'Xem đối tác',
  'tenant.partners.manage': 'Quản lý đối tác',
  'tenant.partners.approve': 'Duyệt đối tác',
  'tenant.listings.read': 'Xem tin đăng',
  'tenant.listings.write': 'Sửa tin đăng',
  'tenant.listings.publish': 'Duyệt và ẩn tin đăng',
  'tenant.bookings.read': 'Xem đặt chỗ',
  'tenant.bookings.manage': 'Quản lý đặt chỗ',
  'tenant.bookings.cancel': 'Hủy đặt chỗ',
  'tenant.commissions.manage': 'Quản lý hoa hồng',
  'tenant.promotions.manage': 'Quản lý khuyến mãi',
  'tenant.finance.read': 'Xem tài chính',
  'tenant.payouts.manage': 'Quản lý chi trả',
  'tenant.affiliates.manage': 'Quản lý cộng tác viên',
  'tenant.members.manage': 'Quản lý nhân sự',
  'tenant.roles.manage': 'Quản lý vai trò',
  'tenant.reports.read': 'Xem báo cáo',
  'tenant.reviews.read': 'Xem đánh giá',
  'tenant.favorites.read': 'Xem yêu thích',
  'tenant.disputes.read': 'Xem khiếu nại',
  'tenant.disputes.resolve': 'Xử lý khiếu nại',
};

/** Display order for the tick grid and the effective-permission preview. */
export const TENANT_PERMISSION_GROUPS: { label: string; keys: TenantPermissionKey[] }[] = [
  { label: 'Danh mục', keys: ['tenant.listings.read', 'tenant.listings.write', 'tenant.listings.publish'] },
  {
    label: 'Vận hành',
    keys: [
      'tenant.bookings.read',
      'tenant.bookings.manage',
      'tenant.bookings.cancel',
      'tenant.partners.read',
      'tenant.partners.manage',
      'tenant.partners.approve',
      'tenant.reviews.read',
      'tenant.favorites.read',
    ],
  },
  {
    label: 'Tài chính',
    keys: [
      'tenant.finance.read',
      'tenant.payouts.manage',
      'tenant.commissions.manage',
      'tenant.reports.read',
      'tenant.disputes.read',
      'tenant.disputes.resolve',
    ],
  },
  { label: 'Tiếp thị', keys: ['tenant.promotions.manage', 'tenant.affiliates.manage'] },
  {
    label: 'Hệ thống',
    keys: [
      'tenant.settings.manage',
      'tenant.theme.manage',
      'tenant.legal.manage',
      'tenant.members.manage',
      'tenant.roles.manage',
    ],
  },
];

/** Vietnamese label per partner permission key — see `TENANT_PERMISSION_LABELS` above; the strict
 *  `Record` means a key added to `partnerPermissionKeySchema` fails typecheck here until labelled. */
export const PARTNER_PERMISSION_LABELS: Record<PartnerPermissionKey, string> = {
  'partner.profile.manage': 'Quản lý hồ sơ',
  'partner.listings.read': 'Xem tin đăng',
  'partner.listings.write': 'Sửa tin đăng',
  'partner.listings.publish': 'Đăng và ẩn tin đăng',
  'partner.bookings.read': 'Xem đặt chỗ',
  'partner.bookings.write': 'Quản lý đặt chỗ',
  'partner.bookings.approve': 'Duyệt đặt chỗ',
  'partner.bookings.cancel': 'Hủy đặt chỗ',
  'partner.availability.manage': 'Quản lý lịch trống',
  'partner.promotions.manage': 'Quản lý khuyến mãi',
  'partner.finance.read': 'Xem tài chính',
  'partner.members.manage': 'Quản lý nhân sự',
  'partner.roles.manage': 'Quản lý vai trò',
  'partner.reviews.read': 'Xem đánh giá',
  'partner.reviews.reply': 'Phản hồi đánh giá',
  'partner.favorites.read': 'Xem yêu thích',
  'partner.disputes.read': 'Xem khiếu nại',
  'partner.disputes.respond': 'Phản hồi khiếu nại',
};

/** Display order for the partner permission preview — see `TENANT_PERMISSION_GROUPS` above. Covers
 *  all 18 `PartnerPermissionKey` values so none silently vanish from the permission preview. */
export const PARTNER_PERMISSION_GROUPS: { label: string; keys: PartnerPermissionKey[] }[] = [
  {
    label: 'Danh mục',
    keys: [
      'partner.listings.read',
      'partner.listings.write',
      'partner.listings.publish',
      'partner.availability.manage',
    ],
  },
  {
    label: 'Vận hành',
    keys: [
      'partner.bookings.read',
      'partner.bookings.write',
      'partner.bookings.approve',
      'partner.bookings.cancel',
      'partner.reviews.read',
      'partner.reviews.reply',
      'partner.favorites.read',
    ],
  },
  {
    label: 'Tài chính',
    keys: ['partner.finance.read', 'partner.disputes.read', 'partner.disputes.respond'],
  },
  { label: 'Tiếp thị', keys: ['partner.promotions.manage'] },
  {
    label: 'Hệ thống',
    keys: ['partner.profile.manage', 'partner.members.manage', 'partner.roles.manage'],
  },
];
