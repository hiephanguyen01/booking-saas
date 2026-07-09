import { Outlet } from 'react-router';
import type { SubscriptionStatusResponse } from '@booking/shared';
import { Alert, AlertDescription, AlertTitle } from '@booking/ui/components/ui/alert';
import { Lock, TriangleAlert } from 'lucide-react';
import type { Route } from './+types/_layout';
import { apiGet } from '~/lib/api.server';
import { requireTenant } from './tenant.server';
import type { TenantAreaContext } from './area-context';
import { formatDate } from './format';

/**
 * Guards the tenant area and resolves the subscription banner state (§6.5). The
 * status endpoint requires `tenant.settings.manage`; a user without it (or any
 * error) simply sees no banner — the status is treated as unknown, never a hard
 * failure.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const { auth, can } = await requireTenant(request);

  let sub: SubscriptionStatusResponse | null = null;
  if (can('tenant.settings.manage')) {
    const res = await apiGet<SubscriptionStatusResponse>('/tenant/subscription/status', auth);
    // 403 (permission) or any transport error → leave null (status unknown → no banner).
    if (res.ok) sub = res.data;
  }

  return {
    readOnly: sub?.dashboardReadOnly ?? false,
    overLimit: sub?.bookingQuota?.overLimit ?? false,
    quota: sub?.bookingQuota ?? null,
    expiresAt: sub?.expiresAt ?? null,
  };
}

export default function TenantLayout({ loaderData }: Route.ComponentProps) {
  const { readOnly, overLimit, quota, expiresAt } = loaderData;
  const context: TenantAreaContext = { readOnly, overLimit };

  return (
    <div className="space-y-6">
      {readOnly ? (
        <Alert variant="destructive">
          <Lock className="size-4" />
          <AlertTitle>Gói dịch vụ đã hết hạn — bảng điều khiển ở chế độ chỉ đọc</AlertTitle>
          <AlertDescription>
            Storefront đã tạm ngưng và mọi thao tác chỉnh sửa bị khoá
            {expiresAt ? ` (hết hạn ${formatDate(expiresAt)})` : ''}. Vui lòng gia hạn gói dịch
            vụ để tiếp tục vận hành.
          </AlertDescription>
        </Alert>
      ) : null}

      {!readOnly && overLimit ? (
        <Alert className="border-amber-500/40 text-amber-800 dark:text-amber-300">
          <TriangleAlert className="size-4" />
          <AlertTitle>Vượt hạn mức đặt chỗ tháng này</AlertTitle>
          <AlertDescription>
            {quota
              ? `Đã dùng ${quota.used}/${quota.limit} lượt đặt chỗ. `
              : ''}
            Đơn đặt mới vẫn được nhận, nhưng hãy cân nhắc nâng cấp gói để tránh gián đoạn.
          </AlertDescription>
        </Alert>
      ) : null}

      <Outlet context={context} />
    </div>
  );
}
