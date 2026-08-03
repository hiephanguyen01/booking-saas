import type { ReactNode } from 'react';
import { Outlet } from 'react-router';
import type { SubscriptionStatusResponse } from '@booking/contracts';
import { Alert, AlertDescription, AlertTitle } from '@booking/ui/components/ui/alert';
import { RouteErrorState } from '@booking/ui/components/route-error-state';
import { CalendarClock, CreditCard, Lock, TriangleAlert } from 'lucide-react';
import type { Route } from './+types/_layout';
import { apiGet } from '~/lib/api.server';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import type { TenantAreaContext } from '~/features/tenant/lib/area-context';
import { formatDate } from '~/lib/format';
import { apiPaths } from '~/constants/api-paths';

/** Show the pre-expiry nudge once the subscription is this close to lapsing. */
const EXPIRY_WARNING_DAYS = 7;

/**
 * Guards the tenant area and resolves the subscription escalation state (§6.5). The
 * status endpoint requires `tenant.settings.manage`; a user without it (or any error)
 * simply sees no banner — the status is treated as unknown, never a hard failure.
 *
 * All of `phase`/`status`/`daysUntilExpiry`/`bookingQuota` arrive on the wire every
 * page load; the layout renders a graded ladder from them (pre-expiry warning →
 * past-due → grace → expired lockout) rather than the old all-or-nothing lockout.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const { auth, can } = await requireTenant(request);

  let sub: SubscriptionStatusResponse | null = null;
  if (can('tenant.settings.manage')) {
    const res = await apiGet<SubscriptionStatusResponse>(apiPaths.tenant.subscriptionStatus, auth);
    // 403 (permission) or any transport error → leave null (status unknown → no banner).
    if (res.ok) sub = res.data;
  }

  return {
    status: sub?.status ?? null,
    phase: sub?.phase ?? null,
    storefrontLive: sub?.storefrontLive ?? true,
    readOnly: sub?.dashboardReadOnly ?? false,
    daysUntilExpiry: sub?.daysUntilExpiry ?? null,
    expiresAt: sub?.expiresAt ?? null,
    quota: sub?.bookingQuota ?? null,
    overLimit: sub?.bookingQuota?.overLimit ?? false,
  };
}

export default function TenantLayout({ loaderData }: Route.ComponentProps) {
  const { status, phase, storefrontLive, readOnly, daysUntilExpiry, expiresAt, quota, overLimit } =
    loaderData;
  // Children consume write-gating flags plus subscription context for status-oriented surfaces.
  const context: TenantAreaContext = {
    readOnly,
    overLimit,
    subscription: {
      status,
      phase,
      storefrontLive,
      daysUntilExpiry,
      expiresAt,
      quota,
    },
  };

  const expiredOn = expiresAt ? ` (hết hạn ${formatDate(expiresAt)})` : '';
  const preExpiry =
    phase === 'active' &&
    daysUntilExpiry !== null &&
    daysUntilExpiry >= 0 &&
    daysUntilExpiry <= EXPIRY_WARNING_DAYS;

  return (
    <div className="space-y-6">
      {/* Escalation ladder — exactly one primary subscription banner, most severe first. */}
      {readOnly ? (
        <Alert variant="destructive">
          <Lock className="size-4" />
          <AlertTitle>Gói dịch vụ đã hết hạn — bảng điều khiển ở chế độ chỉ đọc</AlertTitle>
          <AlertDescription>
            Storefront đã tạm ngưng và mọi thao tác chỉnh sửa bị khoá{expiredOn}. Vui lòng gia hạn
            gói dịch vụ để tiếp tục vận hành.
          </AlertDescription>
        </Alert>
      ) : phase === 'grace' ? (
        <WarningAlert
          icon={<TriangleAlert className="size-4" />}
          title="Gói dịch vụ đã hết hạn — đang trong thời gian gia hạn"
        >
          {storefrontLive
            ? 'Storefront vẫn đang hoạt động tạm thời. Gia hạn ngay để tránh bị khoá và tạm ngưng trang đặt chỗ.'
            : 'Storefront đã tạm ngưng. Gia hạn ngay để khôi phục trang đặt chỗ trước khi bảng điều khiển bị khoá.'}
          {expiredOn ? ` Gói${expiredOn}.` : ''}
        </WarningAlert>
      ) : status === 'past_due' ? (
        <WarningAlert icon={<CreditCard className="size-4" />} title="Thanh toán gần đây thất bại">
          Lần thu phí gần nhất chưa thành công. Vui lòng cập nhật thanh toán để tránh gián đoạn dịch
          vụ{expiredOn}.
        </WarningAlert>
      ) : preExpiry ? (
        <WarningAlert icon={<CalendarClock className="size-4" />} title="Gói dịch vụ sắp hết hạn">
          {daysUntilExpiry === 0
            ? `Gói dịch vụ hết hạn hôm nay${expiredOn}.`
            : `Còn ${daysUntilExpiry} ngày là gói dịch vụ hết hạn${expiredOn}.`}{' '}
          Gia hạn sớm để tránh gián đoạn trang đặt chỗ.
        </WarningAlert>
      ) : null}

      {/* Soft booking-quota indicator (never blocks checkout) — independent of the ladder above. */}
      {!readOnly && overLimit ? (
        <WarningAlert
          icon={<TriangleAlert className="size-4" />}
          title="Vượt hạn mức đặt chỗ tháng này"
        >
          {quota ? `Đã dùng ${quota.used}/${quota.limit} lượt đặt chỗ. ` : ''}
          Đơn đặt mới vẫn được nhận, nhưng hãy cân nhắc nâng cấp gói để tránh gián đoạn.
        </WarningAlert>
      ) : null}

      <Outlet context={context} />
    </div>
  );
}

/**
 * A warning-toned alert built on the themeable `--warning` token (never hardcoded
 * amber), mirroring the status-badge warning tone so it reads correctly in both themes.
 */
function WarningAlert({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <Alert className="border-warning/40 bg-warning/10 text-warning-foreground dark:bg-warning/15 dark:text-warning [&>svg]:text-warning">
      {icon}
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorState error={error} homeHref="/tenant" homeLabel="Về tenant" />;
}
