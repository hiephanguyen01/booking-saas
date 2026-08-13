import type { TenantPermissionKey } from '@booking/contracts';

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
