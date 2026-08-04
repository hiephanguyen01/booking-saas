import type {
  CancellationPolicyResponse,
  DomainResponse,
  GatewayConfigResponse,
  PayoutPolicyDto,
  TenantThemeResponse,
} from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import {
  ArrowRight,
  CircleAlert,
  CircleCheck,
  CreditCard,
  Globe2,
  Palette,
  ReceiptText,
  Store,
  WalletCards,
} from 'lucide-react';
import { Link } from 'react-router';
import { formatDate } from '~/lib/format';
import type { TenantAreaContext } from '~/features/tenant/lib/area-context';

type SectionKey = 'brand' | 'domains' | 'operations' | 'payments' | 'payouts';

interface SettingsOverviewProps {
  theme: TenantThemeResponse | null;
  themeError: string | null;
  domains: DomainResponse[] | null;
  domainsError: string | null;
  cancellationPolicies: CancellationPolicyResponse[] | null;
  cancellationPoliciesError: string | null;
  gatewayConfig: GatewayConfigResponse | null;
  gatewayError: string | null;
  payoutPolicy: PayoutPolicyDto | null;
  payoutPolicyError: string | null;
  subscription: TenantAreaContext['subscription'];
  canTheme: boolean;
  canSettings: boolean;
  canFinance: boolean;
}

export function SettingsOverview({
  theme,
  themeError,
  domains,
  domainsError,
  cancellationPolicies,
  cancellationPoliciesError,
  gatewayConfig,
  gatewayError,
  payoutPolicy,
  payoutPolicyError,
  subscription,
  canTheme,
  canSettings,
  canFinance,
}: SettingsOverviewProps) {
  const primaryDomain = domains?.find((domain) => domain.isPrimary) ?? null;
  const defaultPolicy = cancellationPolicies?.find((policy) => policy.isDefault) ?? null;
  const brandReady = Boolean(theme?.themeConfig.logoUrl && theme.themeConfig.hero?.title);

  return (
    <div className="space-y-5">
      {/* Splits at `2xl`, not `xl`: the settings rail now takes 13.5rem of the
          row, so an `xl` split left both columns too narrow and re-introduced the
          truncation this view exists to avoid. */}
      <section className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
        <Card className="overflow-hidden border-primary/15 bg-primary/[0.035] shadow-none">
          <CardHeader className="pb-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1.5">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Store className="size-5 text-primary" aria-hidden="true" />
                  {theme?.name ?? 'Trạng thái cửa hàng'}
                </CardTitle>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  {theme
                    ? `${verticalLabel(theme.vertical)} · ${theme.defaultLocale === 'vi' ? 'Tiếng Việt' : 'English'}. `
                    : ''}
                  Kiểm tra nhanh các cấu hình ảnh hưởng tới trải nghiệm đặt chỗ và dòng tiền.
                </p>
              </div>
              <StatusBadge ok={subscription.storefrontLive}>
                {subscription.storefrontLive ? 'Storefront đang hoạt động' : 'Storefront tạm ngưng'}
              </StatusBadge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {canTheme ? (
              <OverviewItem
                icon={Palette}
                title="Thương hiệu"
                value={
                  themeError
                    ? 'Không tải được cấu hình'
                    : brandReady
                      ? 'Đã có nhận diện chính'
                      : 'Cần bổ sung logo hoặc hero'
                }
                ok={!themeError && brandReady}
                section="brand"
              />
            ) : null}
            {canSettings ? (
              <OverviewItem
                icon={Globe2}
                title="Tên miền chính"
                value={
                  domainsError
                    ? 'Không tải được tên miền'
                    : primaryDomain?.verifiedAt
                      ? primaryDomain.hostname
                      : primaryDomain
                        ? 'Đang chờ xác minh'
                        : 'Chưa thiết lập'
                }
                ok={!domainsError && Boolean(primaryDomain?.verifiedAt)}
                section="domains"
              />
            ) : null}
            {canSettings ? (
              <OverviewItem
                icon={CreditCard}
                title="Thanh toán"
                value={
                  gatewayError
                    ? 'Không tải được cấu hình'
                    : gatewayConfig?.isActive
                      ? `SePay ${gatewayConfig.environment === 'production' ? 'Production' : 'Sandbox'}`
                      : 'Chưa kết nối cổng thanh toán'
                }
                ok={!gatewayError && Boolean(gatewayConfig?.isActive)}
                section="payments"
              />
            ) : null}
            {canSettings ? (
              <OverviewItem
                icon={ReceiptText}
                title="Chính sách huỷ"
                value={
                  cancellationPoliciesError
                    ? 'Không tải được chính sách'
                    : (defaultPolicy?.name ?? 'Chưa chọn chính sách mặc định')
                }
                ok={!cancellationPoliciesError && Boolean(defaultPolicy)}
                section="operations"
              />
            ) : null}
            {canFinance ? (
              <OverviewItem
                icon={WalletCards}
                title="Chi trả đối tác"
                value={
                  payoutPolicyError
                    ? 'Không tải được chính sách'
                    : payoutPolicy
                      ? `${payoutPolicy.holdingDays} ngày · ${payoutPolicy.cycle === 'weekly' ? 'hàng tuần' : 'hàng tháng'}`
                      : 'Chưa có dữ liệu'
                }
                ok={!payoutPolicyError && Boolean(payoutPolicy)}
                section="payouts"
              />
            ) : null}
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <WalletCards className="size-4 text-primary" aria-hidden="true" />
              Gói dịch vụ
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <InfoLine label="Trạng thái" value={subscriptionLabel(subscription.status)} />
            <InfoLine
              label="Ngày hết hạn"
              value={
                subscription.expiresAt ? formatDate(subscription.expiresAt) : 'Chưa có dữ liệu'
              }
            />
            {subscription.quota ? (
              <InfoLine
                label="Đặt chỗ tháng này"
                value={`${subscription.quota.used}/${subscription.quota.limit}`}
              />
            ) : null}
            <div className="rounded-lg bg-muted/55 px-3.5 py-3 text-xs leading-5 text-muted-foreground">
              {subscription.phase === 'expired'
                ? 'Cửa hàng đang ở chế độ chỉ đọc. Gia hạn gói để tiếp tục chỉnh sửa.'
                : subscription.phase === 'grace'
                  ? 'Gói đã hết hạn và đang trong thời gian gia hạn.'
                  : subscription.daysUntilExpiry !== null
                    ? `Còn ${Math.max(subscription.daysUntilExpiry, 0)} ngày trong kỳ hiện tại.`
                    : 'Trạng thái gói đang được cập nhật.'}
            </div>
          </CardContent>
        </Card>
      </section>

    </div>
  );
}

function OverviewItem({
  icon: Icon,
  title,
  value,
  ok,
  section,
}: {
  icon: typeof Store;
  title: string;
  value: string;
  ok: boolean;
  section: SectionKey;
}) {
  return (
    <Link
      to={`?section=${section}`}
      preventScrollReset
      className="group flex min-w-0 items-start gap-3 rounded-xl border bg-background p-4 transition-colors hover:border-primary/30 hover:bg-primary/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-semibold">
          {title}
          {ok ? (
            <CircleCheck className="size-4 shrink-0 text-success" aria-label="Đã hoàn tất" />
          ) : (
            <CircleAlert className="size-4 shrink-0 text-warning" aria-label="Cần kiểm tra" />
          )}
        </span>
        {/* Wrap rather than ellipsis: these values are the answer the operator
            came for ("bookingstudio.stg.bookingos.vn", "3 ngày · hàng tháng"),
            and in a narrow column every one of them was cut mid-word. */}
        <span className="mt-1 block text-xs leading-5 break-words text-muted-foreground">
          {value}
        </span>
      </span>
      <ArrowRight
        className="mt-2 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
        aria-hidden="true"
      />
    </Link>
  );
}

function StatusBadge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <Badge
      variant="outline"
      className={
        ok
          ? 'border-success/30 bg-success/10 text-success'
          : 'border-warning/35 bg-warning/10 text-warning-foreground'
      }
    >
      {children}
    </Badge>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium tabular-nums">{value}</span>
    </div>
  );
}

function subscriptionLabel(status: TenantAreaContext['subscription']['status']): string {
  if (status === 'trial') return 'Dùng thử';
  if (status === 'active') return 'Đang hoạt động';
  if (status === 'past_due') return 'Thanh toán trễ';
  if (status === 'expired') return 'Đã hết hạn';
  if (status === 'cancelled') return 'Đã huỷ';
  return 'Chưa có dữ liệu';
}

function verticalLabel(vertical: TenantThemeResponse['vertical']): string {
  if (vertical === 'studio') return 'Studio và không gian';
  if (vertical === 'rental') return 'Cho thuê thiết bị';
  if (vertical === 'sport') return 'Sân và địa điểm thể thao';
  return 'Lớp học và lịch nhóm';
}
