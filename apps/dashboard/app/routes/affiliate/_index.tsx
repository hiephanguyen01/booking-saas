import { data as routeData } from 'react-router';
import type {
  AffiliateRateSourceDto,
  AffiliateStatsResponse,
  UpdateAffiliatePayoutInfoInput,
} from '@booking/contracts';
import { updateAffiliatePayoutInfoInputSchema } from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { CheckCircle2, MousePointerClick, Percent, ShoppingBag, Wallet } from 'lucide-react';
import { apiGet, apiPatch } from '~/lib/api.server';
import { formatDiscount, formatRate } from '~/lib/format';
import type { Route } from './+types/_index';
import { requireAffiliate } from '~/features/affiliate/server/affiliate.server';
import { StatCard } from '~/components/stat-card';
import { Money } from '~/components/money';
import { DetailGrid } from '@booking/ui/components/detail/detail-grid';
import { DetailField } from '@booking/ui/components/detail/detail-field';

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, active } = await requireAffiliate(request);
  if (!active) return { stats: null, membership: null };
  const res = await apiGet<AffiliateStatsResponse>('/affiliate/stats', auth);
  return {
    stats: res.ok ? res.data : null,
    membership: {
      payoutInfo: active.payoutInfo,
      customRate: active.customRate,
      effectiveRate: active.effectiveRate,
      effectiveRateType: active.effectiveRateType,
      effectiveRateSource: active.effectiveRateSource,
    },
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth, active } = await requireAffiliate(request);
  if (!active) return routeData({ fieldErrors: null, error: 'Chưa được duyệt.', ok: false }, { status: 403 });

  const parsed = updateAffiliatePayoutInfoInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return routeData(
      { fieldErrors: parsed.error.flatten().fieldErrors, error: null, ok: false },
      { status: 400 },
    );
  }
  const res = await apiPatch('/affiliate/payout-info', parsed.data, auth);
  if (!res.ok) {
    return routeData(
      { fieldErrors: null, error: res.error ?? 'Không lưu được thông tin tài khoản.', ok: false },
      { status: 400 },
    );
  }
  return { fieldErrors: null, error: null, ok: true as const };
}

const RATE_SOURCE_LABEL: Record<AffiliateRateSourceDto, string> = {
  custom: 'Mức riêng dành cho bạn',
  rule: 'Theo quy tắc của tenant',
  none: 'Chưa được cấu hình',
};

const payoutFields: FieldConfig<UpdateAffiliatePayoutInfoInput>[] = [
  { name: 'bankName', type: 'text', label: 'Ngân hàng', placeholder: 'VD: Vietcombank', colSpan: 1 },
  { name: 'accountNo', type: 'text', label: 'Số tài khoản', placeholder: 'VD: 0123456789', colSpan: 1 },
  { name: 'accountHolder', type: 'text', label: 'Chủ tài khoản', placeholder: 'VD: NGUYEN VAN A', colSpan: 2 },
  { name: 'note', type: 'textarea', label: 'Ghi chú', placeholder: 'Thông tin thêm cho tenant khi chi trả', colSpan: 2 },
];

export default function AffiliateOverview({ loaderData, actionData }: Route.ComponentProps) {
  const { stats, membership } = loaderData;
  if (!stats || !membership) {
    return <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>;
  }

  const ok = Boolean(actionData?.ok);
  const error = actionData?.error ?? null;
  const fieldErrors = actionData?.fieldErrors ?? null;

  const rate = formatDiscount(membership.effectiveRateType, membership.effectiveRate);

  const payoutDefaults: UpdateAffiliatePayoutInfoInput = {
    bankName: membership.payoutInfo.bankName ?? '',
    accountNo: membership.payoutInfo.accountNo ?? '',
    accountHolder: membership.payoutInfo.accountHolder ?? '',
    note: membership.payoutInfo.note ?? '',
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<MousePointerClick className="size-4" />} label="Lượt click" value={stats.clicks} />
        <StatCard icon={<ShoppingBag className="size-4" />} label="Đơn đặt" value={stats.bookings} />
        <StatCard
          icon={<Percent className="size-4" />}
          label="Tỷ lệ chuyển đổi"
          value={formatRate(stats.conversionRate)}
        />
        <StatCard
          icon={<Wallet className="size-4" />}
          label="Đã nhận"
          value={<Money value={stats.paidCommission} />}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Chờ xác nhận" value={<Money value={stats.pendingCommission} />} tone="muted" />
        <StatCard label="Đã xác nhận (sẽ trả)" value={<Money value={stats.confirmedCommission} />} tone="positive" />
        <StatCard label="Đã trả" value={<Money value={stats.paidCommission} />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mức hoa hồng của bạn</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailGrid columns={1}>
              <DetailField
                label="Mức áp dụng"
                emphasis="strong"
                value={rate}
                hint={RATE_SOURCE_LABEL[membership.effectiveRateSource]}
              />
              <DetailField
                label="Hoa hồng đã huỷ / thu hồi"
                value={
                  <span className="tabular-nums">
                    <Money value={stats.reversedCommission} /> · <Money value={stats.clawedBackCommission} />
                  </span>
                }
                emphasis="muted"
                hint="Hoa hồng bị huỷ khi đơn bị huỷ/từ chối, hoặc thu hồi sau khi hoàn tiền."
              />
            </DetailGrid>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tài khoản nhận tiền</CardTitle>
            <CardDescription>Tenant dùng thông tin này để chi trả hoa hồng cho bạn.</CardDescription>
          </CardHeader>
          <CardContent>
            {ok ? (
              <Alert className="mb-4 border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-4" />
                <AlertDescription>Đã lưu thông tin tài khoản.</AlertDescription>
              </Alert>
            ) : null}
            <GenericForm
              schema={updateAffiliatePayoutInfoInputSchema}
              fields={payoutFields}
              defaultValues={payoutDefaults}
              columns={2}
              submitLabel="Lưu tài khoản"
              method="patch"
              serverError={error}
              fieldErrors={fieldErrors}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
