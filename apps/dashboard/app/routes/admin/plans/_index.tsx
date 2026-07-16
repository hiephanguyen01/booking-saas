import { useEffect, useState } from 'react';
import { data, Form } from 'react-router';
import { Check, Minus, Pencil, Trash2 } from 'lucide-react';
import {
  createPlanInputSchema,
  updatePlanInputSchema,
  type CreatePlanInput,
  type PlanResponse,
  type UpdatePlanInput,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@booking/ui/components/ui/alert-dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@booking/ui/components/ui/dialog';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import type { Route } from './+types/_index';
import { apiDelete, apiGet, apiPatch, apiPost } from '~/lib/api.server';
import { platformLoader, platformSession } from '~/routes/admin/lib/api.server';
import { formatNumber } from '~/lib/format';
import { PageHeader } from '~/components/page-header';
import { Money } from '~/components/money';
import { DateTimeValue } from '~/components/date-time-value';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Gói dịch vụ · Bookify Admin' }];
}

/** Which form/action a result belongs to, so an error stays in its own surface. */
interface ActionResult {
  scope: 'create' | 'update' | 'delete';
  id?: string;
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Partial<Record<string, string[] | undefined>>;
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
  const { auth } = await platformSession(request, 'platform.plans.manage');
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const body: unknown = await request.json();

    // The edit form injects the plan `id`; its presence discriminates update from create.
    if (body && typeof body === 'object' && 'id' in body) {
      const { id, ...rest } = body as { id: string } & Record<string, unknown>;
      const parsed = updatePlanInputSchema.safeParse(rest);
      if (!parsed.success) {
        return data<ActionResult>(
          { scope: 'update', id, fieldErrors: parsed.error.flatten().fieldErrors },
          { status: 400 },
        );
      }
      const res = await apiPatch<PlanResponse>(`/admin/plans/${id}`, parsed.data, auth);
      if (!res.ok) {
        return data<ActionResult>(
          { scope: 'update', id, error: res.error, fieldErrors: res.errors },
          { status: 400 },
        );
      }
      return data<ActionResult>({
        scope: 'update',
        id,
        ok: true,
        message: `Đã cập nhật gói “${res.data?.name}”.`,
      });
    }

    const parsed = createPlanInputSchema.safeParse(body);
    if (!parsed.success) {
      return data<ActionResult>(
        { scope: 'create', fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const res = await apiPost<PlanResponse>('/admin/plans', parsed.data, auth);
    if (!res.ok) {
      return data<ActionResult>(
        { scope: 'create', error: res.error, fieldErrors: res.errors },
        { status: 400 },
      );
    }
    return data<ActionResult>({
      scope: 'create',
      ok: true,
      message: `Đã tạo gói “${res.data?.name}”.`,
    });
  }

  // Delete submits urlencoded FormData.
  const form = await request.formData();
  if (String(form.get('intent')) === 'delete') {
    const id = String(form.get('id') ?? '');
    const res = await apiDelete(`/admin/plans/${id}`, auth);
    if (!res.ok) {
      const message =
        res.code === 'PLAN_HAS_SUBSCRIBERS' || res.code === 'PLAN_HAS_SUBSCRIPTION_HISTORY'
          ? 'Không thể xoá gói đang (hoặc đã từng) có người đăng ký. Hãy tắt gói thay vì xoá.'
          : (res.error ?? 'Không xoá được gói.');
      return data<ActionResult>({ scope: 'delete', id, error: message }, { status: 400 });
    }
    return data<ActionResult>({ scope: 'delete', id, ok: true, message: 'Đã xoá gói.' });
  }

  return data<ActionResult>({ scope: 'create', error: 'Hành động không hợp lệ.' }, { status: 400 });
}

const Bool = ({ on }: { on: boolean }) =>
  on ? (
    <Check className="size-4 text-emerald-600 dark:text-emerald-400" aria-label="Có" />
  ) : (
    <Minus className="size-4 text-muted-foreground" aria-label="Không" />
  );

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

const editFields: FieldConfig<UpdatePlanInput>[] = [
  { name: 'name', type: 'text', label: 'Tên gói' },
  {
    name: 'priceMonthly',
    type: 'text',
    label: 'Giá / tháng (VND)',
    description: 'Số nguyên đồng, không dấu chấm.',
  },
  { name: 'limits.maxPartners', type: 'number', label: 'Số partner tối đa' },
  { name: 'limits.maxListings', type: 'number', label: 'Số listing tối đa' },
  { name: 'limits.maxBookingsPerMonth', type: 'number', label: 'Booking / tháng' },
  { name: 'limits.customDomain', type: 'switch', label: 'Cho phép tên miền riêng' },
  { name: 'limits.affiliateModule', type: 'switch', label: 'Bật module affiliate' },
  { name: 'isActive', type: 'switch', label: 'Kích hoạt gói' },
  {
    name: 'repriceExistingSubscribers',
    type: 'switch',
    label: 'Áp giá mới cho người đăng ký hiện tại',
    description:
      'Bắt buộc khi đổi giá một gói đang có người đăng ký — giá mới áp cho tất cả họ ngay.',
  },
];

export default function PlansPage({ loaderData, actionData }: Route.ComponentProps) {
  const { plans, error } = loaderData;
  const result = (actionData ?? null) as ActionResult | null;

  const [editing, setEditing] = useState<PlanResponse | null>(null);

  // Close the edit dialog once its update succeeds.
  useEffect(() => {
    if (result?.scope === 'update' && result.ok) setEditing(null);
  }, [result]);

  const createError = result?.scope === 'create' && result.error ? result.error : null;
  const createFieldErrors = result?.scope === 'create' ? (result.fieldErrors ?? null) : null;
  const createOk = result?.scope === 'create' && result.ok ? result.message : null;
  const deleteError = result?.scope === 'delete' && result.error ? result.error : null;
  const editError =
    result?.scope === 'update' && result.id === editing?.id && result.error ? result.error : null;
  const editFieldErrors =
    result?.scope === 'update' && result.id === editing?.id ? (result.fieldErrors ?? null) : null;

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
      className: 'text-right font-medium',
      cell: (p) => <Money value={p.priceMonthly} />,
    },
    {
      header: 'Người đăng ký',
      headClassName: 'text-right',
      className: 'text-right tabular-nums',
      cell: (p) => formatNumber(p.subscriberCount),
    },
    {
      header: 'MRR',
      headClassName: 'text-right',
      className: 'text-right font-medium',
      cell: (p) => <Money value={p.mrr} />,
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
    {
      header: 'Cập nhật',
      cell: (p) => <DateTimeValue iso={p.updatedAt} className="text-sm text-muted-foreground" />,
    },
    {
      header: '',
      headClassName: 'text-right',
      className: 'text-right',
      cell: (p) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Sửa gói ${p.name}`}
            onClick={() => setEditing(p)}
          >
            <Pencil className="size-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Xoá gói ${p.name}`}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Xoá gói “{p.name}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  Chỉ xoá được gói chưa từng có người đăng ký. Nếu gói đã bán, hãy tắt gói thay vì
                  xoá. Thao tác này không thể hoàn tác.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Huỷ</AlertDialogCancel>
                <Form method="post">
                  <input type="hidden" name="intent" value="delete" />
                  <input type="hidden" name="id" value={p.id} />
                  <AlertDialogAction type="submit" variant="destructive">
                    Xoá gói
                  </AlertDialogAction>
                </Form>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gói dịch vụ"
        description="Định nghĩa các gói đăng ký, hạn mức, và theo dõi doanh thu định kỳ."
      />

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          Không tải được danh sách gói: {error}
        </div>
      ) : null}

      {deleteError ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {deleteError}
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
            {createOk ? (
              <div
                role="status"
                className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300"
              >
                {createOk}
              </div>
            ) : null}
            <GenericForm
              schema={createPlanInputSchema}
              fields={createFields}
              submitLabel="Tạo gói"
              serverError={createError}
              fieldErrors={createFieldErrors}
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

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Sửa gói{editing ? ` “${editing.name}”` : ''}</DialogTitle>
            <DialogDescription>
              Cập nhật giá và hạn mức. Đổi giá một gói đang có người đăng ký cần bật “áp giá mới”.
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <GenericForm
              key={editing.id}
              schema={updatePlanInputSchema}
              fields={editFields}
              method="patch"
              submitLabel="Lưu thay đổi"
              serverError={editError}
              fieldErrors={editFieldErrors}
              transform={(v) => ({ ...v, id: editing.id })}
              defaultValues={{
                name: editing.name,
                priceMonthly: editing.priceMonthly,
                limits: { ...editing.limits },
                isActive: editing.isActive,
                repriceExistingSubscribers: false,
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
