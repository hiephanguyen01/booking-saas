import { data } from 'react-router';
import { Check, Minus } from 'lucide-react';
import { createPlanInputSchema, type CreatePlanInput, type PlanResponse } from '@booking/contracts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import type { Route } from './+types/_index';
import { apiGet, apiPost } from '~/lib/api.server';
import { platformLoader, platformSession } from '~/routes/admin/lib/api.server';
import { formatNumber, formatVnd } from '~/routes/admin/lib/format';
import { PageHeader } from '~/routes/admin/components/page-header';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Gói dịch vụ · Bookify Admin' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  return platformLoader(
    request,
    async (auth) => {
      const res = await apiGet<PlanResponse[]>('/admin/plans', auth);
      return { plans: res.ok ? (res.data ?? []) : [], error: res.ok ? null : res.error };
    },
    'platform.plans.manage',
  );
}

export async function action({ request }: Route.ActionArgs) {
  const { auth, refreshedCookie } = await platformSession(request, 'platform.plans.manage');
  const parsed = createPlanInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return data({ fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const res = await apiPost<PlanResponse>('/admin/plans', parsed.data, auth);
  const cookie = await refreshedCookie();
  const init = cookie ? { headers: { 'Set-Cookie': cookie } } : {};
  if (!res.ok) {
    return data({ error: res.error, fieldErrors: res.errors }, { status: 400, ...init });
  }
  return data({ ok: true, message: `Đã tạo gói “${res.data?.name}”.` }, init);
}

const Bool = ({ on }: { on: boolean }) =>
  on ? (
    <Check className="size-4 text-emerald-600 dark:text-emerald-400" aria-label="Có" />
  ) : (
    <Minus className="size-4 text-muted-foreground" aria-label="Không" />
  );

const columns: DataTableColumn<PlanResponse>[] = [
  {
    header: 'Gói',
    cell: (p) => (
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">{p.name}</span>
        {!p.isActive ? <span className="text-xs text-muted-foreground">Đã tắt</span> : null}
      </div>
    ),
  },
  {
    header: 'Giá / tháng',
    headClassName: 'text-right',
    className: 'text-right tabular-nums font-medium',
    cell: (p) => formatVnd(p.priceMonthly),
  },
  {
    header: 'Partner',
    headClassName: 'text-right',
    className: 'text-right tabular-nums',
    cell: (p) => formatNumber(p.limits.maxPartners),
  },
  {
    header: 'Listing',
    headClassName: 'text-right',
    className: 'text-right tabular-nums',
    cell: (p) => formatNumber(p.limits.maxListings),
  },
  {
    header: 'Booking / tháng',
    headClassName: 'text-right',
    className: 'text-right tabular-nums',
    cell: (p) => formatNumber(p.limits.maxBookingsPerMonth),
  },
  {
    header: 'Tên miền riêng',
    headClassName: 'text-center',
    className: 'text-center',
    cell: (p) => (
      <div className="flex justify-center">
        <Bool on={p.limits.customDomain} />
      </div>
    ),
  },
  {
    header: 'Affiliate',
    headClassName: 'text-center',
    className: 'text-center',
    cell: (p) => (
      <div className="flex justify-center">
        <Bool on={p.limits.affiliateModule} />
      </div>
    ),
  },
];

const createFields: FieldConfig<CreatePlanInput>[] = [
  { name: 'name', type: 'text', label: 'Tên gói', placeholder: 'Studio Pro' },
  {
    name: 'priceMonthly',
    type: 'text',
    label: 'Giá / tháng (VND)',
    placeholder: '990000',
    description: 'Số nguyên đồng, không dấu chấm.',
  },
  { name: 'limits.maxPartners', type: 'number', label: 'Số partner tối đa' },
  { name: 'limits.maxListings', type: 'number', label: 'Số listing tối đa' },
  { name: 'limits.maxBookingsPerMonth', type: 'number', label: 'Booking / tháng' },
  { name: 'limits.customDomain', type: 'switch', label: 'Cho phép tên miền riêng' },
  { name: 'limits.affiliateModule', type: 'switch', label: 'Bật module affiliate' },
  { name: 'isActive', type: 'switch', label: 'Kích hoạt gói' },
];

export default function PlansPage({ loaderData, actionData }: Route.ComponentProps) {
  const { plans, error } = loaderData;
  const serverError = actionData && 'error' in actionData ? actionData.error : null;
  const fieldErrors = actionData && 'fieldErrors' in actionData ? actionData.fieldErrors : null;
  const okMessage =
    actionData && 'ok' in actionData && actionData.ok && 'message' in actionData
      ? (actionData.message as string)
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gói dịch vụ"
        description="Định nghĩa các gói đăng ký và hạn mức của từng gói."
      />

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          Không tải được danh sách gói: {error}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="overflow-x-auto">
            <DataTable
              columns={columns}
              data={plans}
              getRowKey={(p) => p.id}
              emptyMessage="Chưa có gói nào. Tạo gói đầu tiên ở bên phải."
            />
          </div>
        </div>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Tạo gói mới</CardTitle>
            <CardDescription>Đặt giá và hạn mức cho gói.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {okMessage ? (
              <div
                role="status"
                className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300"
              >
                {okMessage}
              </div>
            ) : null}
            <GenericForm
              schema={createPlanInputSchema}
              fields={createFields}
              submitLabel="Tạo gói"
              serverError={serverError}
              fieldErrors={fieldErrors}
              defaultValues={{
                name: '',
                priceMonthly: '',
                limits: {
                  maxPartners: 0,
                  maxListings: 0,
                  maxBookingsPerMonth: 0,
                  customDomain: false,
                  affiliateModule: false,
                },
                isActive: true,
              }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
