import { Form, Link } from 'react-router';
import type { PlanResponse, SubscriptionHistoryItem } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { NativeSelect } from '@booking/ui/components/ui/native-select';
import { Textarea } from '@booking/ui/components/ui/textarea';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { DetailField } from '@booking/ui/components/detail/detail-field';
import { DetailGrid } from '@booking/ui/components/detail/detail-grid';
import { DetailSection } from '@booking/ui/components/detail/detail-section';
import type { CurrentSubscription } from '~/features/admin/server/tenant-detail-actions.server';
import { SUBSCRIPTION_STATUS_LABELS } from '~/constants/tenancy';
import { dashboardPaths } from '~/constants/paths';
import { ErrorBanner } from '~/components/action-feedback';
import { PaginationBar } from '~/components/pagination-bar';
import { Money } from '~/components/money';
import { DateTimeValue } from '~/components/date-time-value';
import { SubscriptionStatusBadge } from '~/components/status-badge';

const historyColumns: DataTableColumn<SubscriptionHistoryItem>[] = [
  { header: 'Gói', cell: (s) => <span className="font-medium">{s.planName}</span> },
  { header: 'Trạng thái', cell: (s) => <SubscriptionStatusBadge status={s.status} /> },
  {
    header: 'Bắt đầu',
    className: 'tabular-nums text-muted-foreground',
    cell: (s) => <DateTimeValue iso={s.startsAt} />,
  },
  {
    header: 'Hết hạn',
    className: 'tabular-nums text-muted-foreground',
    cell: (s) => <DateTimeValue iso={s.expiresAt} />,
  },
  {
    header: 'Ghi chú',
    cell: (s) =>
      s.note ? (
        <span className="text-sm text-muted-foreground">{s.note}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
];

/** The "Gán/Đổi gói" quick form — posts `intent=assign-subscription` FormData to the route. */
function AssignSubscriptionForm({
  activePlans,
  busy,
  hasSubscription,
}: {
  activePlans: PlanResponse[];
  busy: boolean;
  hasSubscription: boolean;
}) {
  const defaultExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const minDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return (
    <Form method="post" className="space-y-3">
      <input type="hidden" name="intent" value="assign-subscription" />
      <div className="space-y-1.5">
        <Label htmlFor="planId">Gói</Label>
        <NativeSelect id="planId" name="planId" className="w-full" required>
          {activePlans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="status">Trạng thái</Label>
          <NativeSelect id="status" name="status" className="w-full" defaultValue="active">
            {(['trial', 'active', 'past_due'] as const).map((s) => (
              <option key={s} value={s}>
                {SUBSCRIPTION_STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="expiresAt">Hết hạn</Label>
          <Input
            id="expiresAt"
            name="expiresAt"
            type="date"
            required
            min={minDate}
            defaultValue={defaultExpiry}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="note">Ghi chú</Label>
        <Textarea id="note" name="note" rows={2} placeholder="Số hoá đơn, ghi chú nội bộ…" />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {hasSubscription ? 'Đổi gói' : 'Gán gói'}
      </Button>
    </Form>
  );
}

/** "Gói & thanh toán" card: current plan, assign/change form, and subscription history. */
export function TenantSubscriptionSection({
  subscription,
  history,
  historyTotal,
  page,
  pageSize,
  pageHref,
  plans,
  busy,
  serverError,
}: {
  subscription: CurrentSubscription | null;
  history: SubscriptionHistoryItem[] | null;
  historyTotal: number;
  page: number;
  pageSize: number;
  pageHref: (target: { page: number; pageSize: number }) => string;
  plans: PlanResponse[];
  busy: boolean;
  serverError: string | null;
}) {
  const activePlans = plans.filter((p) => p.isActive);
  const plan = subscription?.plan ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Gói &amp; thanh toán</CardTitle>
        <CardDescription>Gói hiện tại, hạn mức, và lịch sử đăng ký.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        <div className="grid gap-8 lg:grid-cols-2">
          <DetailSection title="Gói hiện tại" emptyMessage="Tenant chưa được gán gói nào.">
            {subscription ? (
              <DetailGrid columns={2}>
                <DetailField
                  label="Gói"
                  value={plan?.name}
                  emphasis="strong"
                  state={plan ? undefined : { kind: 'failed' }}
                />
                <DetailField
                  label="Trạng thái"
                  value={<SubscriptionStatusBadge status={subscription.subscription.status} />}
                />
                <DetailField
                  label="Giá / tháng"
                  value={plan ? <Money value={plan.priceMonthly} /> : undefined}
                  emphasis="strong"
                />
                <DetailField
                  label="Hạn mức"
                  value={
                    plan
                      ? `${plan.limits.maxPartners} partner · ${plan.limits.maxListings} listing`
                      : undefined
                  }
                  hint={plan ? `${plan.limits.maxBookingsPerMonth} booking / tháng` : undefined}
                />
                <DetailField
                  label="Bắt đầu"
                  value={<DateTimeValue iso={subscription.subscription.startsAt} />}
                />
                <DetailField
                  label="Hết hạn"
                  value={<DateTimeValue iso={subscription.subscription.expiresAt} />}
                />
                <DetailField
                  label="Ghi chú"
                  span={2}
                  value={subscription.subscription.note}
                  omitWhenEmpty
                />
              </DetailGrid>
            ) : null}
          </DetailSection>

          <DetailSection
            title={subscription ? 'Đổi gói' : 'Gán gói'}
            description="Ghi nhận đăng ký thủ công cho tenant."
          >
            <ErrorBanner error={serverError} />
            {activePlans.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Chưa có gói đang bật.{' '}
                <Link to={dashboardPaths.admin.plans} className="underline underline-offset-4">
                  Tạo gói
                </Link>{' '}
                trước khi gán.
              </p>
            ) : (
              <AssignSubscriptionForm
                activePlans={activePlans}
                busy={busy}
                hasSubscription={subscription !== null}
              />
            )}
          </DetailSection>
        </div>

        <DetailSection
          title="Lịch sử đăng ký"
          emptyMessage={history && history.length === 0 ? 'Chưa có lịch sử đăng ký.' : undefined}
        >
          {history === null ? (
            <p className="text-sm text-warning">Không tải được lịch sử đăng ký.</p>
          ) : history.length > 0 ? (
            <>
              <DataTable
                columns={historyColumns}
                data={history}
                getRowKey={(s) => s.id}
                emptyMessage="Chưa có lịch sử đăng ký."
              />
              <PaginationBar page={page} pageSize={pageSize} total={historyTotal} hrefFor={pageHref} />
            </>
          ) : null}
        </DetailSection>
      </CardContent>
    </Card>
  );
}
