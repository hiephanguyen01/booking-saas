import { data, Form, Link, redirect, useNavigation } from 'react-router';
import { ArrowLeft, Globe, PauseCircle, PlayCircle, ShieldCheck } from 'lucide-react';
import {
  addDomainInputSchema,
  assignSubscriptionInputSchema,
  updateTenantInputSchema,
  type AddDomainInput,
  type DomainResponse,
  type DomainVerificationResult,
  type PlanResponse,
  type SubscriptionResponse,
  type TenantResponse,
  type UpdateTenantInput,
} from '@booking/contracts';
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
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import type { Route } from './+types/$id';
import { apiGet, apiPatch, apiPost } from '~/lib/api.server';
import { platformLoader, platformSession } from '~/routes/admin/lib/api.server';
import {
  formatDate,
  formatVnd,
  SUBSCRIPTION_STATUS_LABELS,
  VERTICAL_LABELS,
} from '~/routes/admin/lib/format';
import { PageHeader } from '~/routes/admin/components/page-header';
import {
  SubscriptionStatusBadge,
  TenantStatusBadge,
} from '~/routes/admin/components/status-badge';

interface CurrentSubscription {
  subscription: SubscriptionResponse;
  plan: PlanResponse | null;
}

export function meta({ data: d }: Route.MetaArgs): Route.MetaDescriptors {
  return [{ title: `${d?.tenant?.name ?? 'Tenant'} · Bookify Admin` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const id = params.id;
  return platformLoader(
    request,
    async (auth) => {
      const [tenantRes, subRes, domainsRes, plansRes] = await Promise.all([
        apiGet<TenantResponse>(`/admin/tenants/${id}`, auth),
        apiGet<CurrentSubscription | null>(`/admin/tenants/${id}/subscription`, auth),
        apiGet<DomainResponse[]>(`/admin/tenants/${id}/domains`, auth),
        apiGet<PlanResponse[]>('/admin/plans', auth),
      ]);
      if (!tenantRes.ok || !tenantRes.data) {
        throw new Response('Không tìm thấy tenant', { status: tenantRes.status || 404 });
      }
      return {
        tenant: tenantRes.data,
        subscription: subRes.ok ? subRes.data : null,
        domains: domainsRes.ok ? (domainsRes.data ?? []) : [],
        plans: plansRes.ok ? (plansRes.data ?? []) : [],
      };
    },
    'platform.tenants.read',
  );
}

export async function action({ request, params }: Route.ActionArgs) {
  const id = params.id;
  const contentType = request.headers.get('content-type') ?? '';

  // GenericForm (tenant edit) submits JSON; the quick actions + subscription
  // assignment submit urlencoded FormData.
  if (contentType.includes('application/json')) {
    const body: unknown = await request.json();
    const { auth, refreshedCookie } = await platformSession(request, 'platform.tenants.write');

    // Both the tenant-edit and add-domain GenericForms post JSON to this route.
    // Discriminate on `hostname`, which exists only in the add-domain payload.
    if (body && typeof body === 'object' && 'hostname' in body) {
      const parsed = addDomainInputSchema.safeParse(body);
      if (!parsed.success) {
        return data({ fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 });
      }
      const res = await apiPost<DomainResponse>(`/admin/tenants/${id}/domains`, parsed.data, auth);
      const cookie = await refreshedCookie();
      const init = cookie ? { headers: { 'Set-Cookie': cookie } } : {};
      if (!res.ok)
        return data({ error: res.error, fieldErrors: res.errors }, { status: 400, ...init });
      return data({ ok: true, message: 'Đã thêm tên miền.' }, init);
    }

    const parsed = updateTenantInputSchema.safeParse(body);
    if (!parsed.success) {
      return data({ fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const res = await apiPatch<TenantResponse>(`/admin/tenants/${id}`, parsed.data, auth);
    const cookie = await refreshedCookie();
    const init = cookie ? { headers: { 'Set-Cookie': cookie } } : {};
    if (!res.ok) return data({ error: res.error, fieldErrors: res.errors }, { status: 400, ...init });
    return data({ ok: true, message: 'Đã cập nhật tenant.' }, init);
  }

  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  const permission =
    intent === 'assign-subscription' ? 'platform.subscriptions.manage' : 'platform.tenants.write';
  const { auth, refreshedCookie } = await platformSession(request, permission);

  if (intent === 'verify-domain') {
    const domainId = String(form.get('domainId') ?? '');
    const res = await apiPost<DomainVerificationResult>(
      `/admin/tenants/${id}/domains/${domainId}/verify`,
      {},
      auth,
    );
    const cookie = await refreshedCookie();
    const init = cookie ? { headers: { 'Set-Cookie': cookie } } : {};
    if (!res.ok) return data({ error: res.error }, { status: 400, ...init });
    const message =
      res.data?.status === 'verified'
        ? 'Tên miền đã được xác minh.'
        : 'Đang kiểm tra bản ghi DNS, vui lòng thử lại sau ít phút.';
    return data({ ok: true, message }, init);
  }

  if (intent === 'set-status') {
    const status = String(form.get('status') ?? '');
    const res = await apiPatch<TenantResponse>(`/admin/tenants/${id}`, { status }, auth);
    const cookie = await refreshedCookie();
    const init = cookie ? { headers: { 'Set-Cookie': cookie } } : {};
    if (!res.ok) return data({ error: res.error }, { status: 400, ...init });
    return data({ ok: true, message: 'Đã cập nhật trạng thái.' }, init);
  }

  if (intent === 'assign-subscription') {
    const expiresAtRaw = String(form.get('expiresAt') ?? '');
    const payload = {
      planId: String(form.get('planId') ?? ''),
      // A calendar day → end-of-day UTC so it is strictly after `startsAt` (now).
      expiresAt: expiresAtRaw ? new Date(`${expiresAtRaw}T23:59:59.000Z`).toISOString() : '',
      status: String(form.get('status') ?? 'active'),
      note: (form.get('note') as string) || undefined,
    };
    const parsed = assignSubscriptionInputSchema.safeParse(payload);
    if (!parsed.success) {
      return data(
        { error: 'Dữ liệu gói không hợp lệ.', fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const res = await apiPost<SubscriptionResponse>(
      `/admin/tenants/${id}/subscription`,
      parsed.data,
      auth,
    );
    const cookie = await refreshedCookie();
    const init = cookie ? { headers: { 'Set-Cookie': cookie } } : {};
    if (!res.ok) return data({ error: res.error }, { status: 400, ...init });
    return redirect(`/admin/tenants/${id}`, init);
  }

  return data({ error: 'Hành động không hợp lệ.' }, { status: 400 });
}

const editFields: FieldConfig<UpdateTenantInput>[] = [
  { name: 'name', type: 'text', label: 'Tên tenant', colSpan: 2 },
  {
    name: 'vertical',
    type: 'select',
    label: 'Loại hình',
    options: [
      { label: 'Studio', value: 'studio' },
      { label: 'Cho thuê', value: 'rental' },
      { label: 'Lớp học', value: 'classes' },
    ],
  },
  {
    name: 'status',
    type: 'select',
    label: 'Trạng thái',
    options: [
      { label: 'Đang hoạt động', value: 'active' },
      { label: 'Tạm ngưng', value: 'suspended' },
      { label: 'Hết hạn', value: 'expired' },
    ],
  },
  { name: 'defaultTimezone', type: 'text', label: 'Múi giờ' },
  {
    name: 'defaultLocale',
    type: 'select',
    label: 'Ngôn ngữ',
    options: [
      { label: 'Tiếng Việt', value: 'vi' },
      { label: 'English', value: 'en' },
    ],
  },
];

export default function TenantDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { tenant, subscription, domains, plans } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';

  const serverError = actionData && 'error' in actionData ? actionData.error : null;
  const fieldErrors = actionData && 'fieldErrors' in actionData ? actionData.fieldErrors : null;
  const okMessage =
    actionData && 'ok' in actionData && actionData.ok && 'message' in actionData
      ? (actionData.message as string)
      : null;

  const nextStatus = tenant.status === 'active' ? 'suspended' : 'active';

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link to="/admin/tenants">
            <ArrowLeft className="size-4" />
            Danh sách tenant
          </Link>
        </Button>
        <PageHeader
          title={tenant.name}
          description={`${tenant.slug} · ${VERTICAL_LABELS[tenant.vertical] ?? tenant.vertical}`}
          actions={
            <div className="flex items-center gap-3">
              <TenantStatusBadge status={tenant.status} />
              <Form method="post">
                <input type="hidden" name="intent" value="set-status" />
                <input type="hidden" name="status" value={nextStatus} />
                <Button
                  type="submit"
                  variant={nextStatus === 'suspended' ? 'destructive' : 'default'}
                  size="sm"
                  disabled={busy}
                >
                  {nextStatus === 'suspended' ? (
                    <>
                      <PauseCircle className="size-4" />
                      Tạm ngưng
                    </>
                  ) : (
                    <>
                      <PlayCircle className="size-4" />
                      Kích hoạt
                    </>
                  )}
                </Button>
              </Form>
            </div>
          }
        />
      </div>

      {okMessage ? (
        <div
          role="status"
          className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300"
        >
          {okMessage}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Thông tin tenant</CardTitle>
            <CardDescription>Cập nhật thông tin cơ bản và trạng thái tenant.</CardDescription>
          </CardHeader>
          <CardContent>
            <GenericForm
              schema={updateTenantInputSchema}
              fields={editFields}
              columns={2}
              submitLabel="Lưu thay đổi"
              method="patch"
              serverError={serverError}
              fieldErrors={fieldErrors}
              defaultValues={{
                name: tenant.name,
                vertical: tenant.vertical,
                status: tenant.status,
                defaultTimezone: tenant.defaultTimezone,
                defaultLocale: tenant.defaultLocale,
              }}
            />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <SubscriptionCard subscription={subscription} plans={plans} busy={busy} />
          <DomainsCard
            domains={domains}
            busy={busy}
            serverError={serverError}
            fieldErrors={fieldErrors}
          />
        </div>
      </div>
    </div>
  );
}

function SubscriptionCard({
  subscription,
  plans,
  busy,
}: {
  subscription: CurrentSubscription | null;
  plans: PlanResponse[];
  busy: boolean;
}) {
  const activePlans = plans.filter((p) => p.isActive);
  const defaultExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const minDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Gói dịch vụ</CardTitle>
        <CardDescription>Gói hiện tại và gán/đổi gói cho tenant.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {subscription ? (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{subscription.plan?.name ?? 'Gói không xác định'}</span>
              <SubscriptionStatusBadge status={subscription.subscription.status} />
            </div>
            <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
              {subscription.plan ? (
                <div className="flex justify-between">
                  <dt>Giá / tháng</dt>
                  <dd className="tabular-nums">{formatVnd(subscription.plan.priceMonthly)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt>Hiệu lực đến</dt>
                <dd className="tabular-nums">{formatDate(subscription.subscription.expiresAt)}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Tenant chưa được gán gói nào.</p>
        )}

        {activePlans.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Chưa có gói đang bật.{' '}
            <Link to="/admin/plans" className="underline underline-offset-4">
              Tạo gói
            </Link>{' '}
            trước khi gán.
          </p>
        ) : (
          <Form method="post" className="space-y-3">
            <input type="hidden" name="intent" value="assign-subscription" />
            <div className="space-y-1.5">
              <Label htmlFor="planId">Gói</Label>
              <NativeSelect id="planId" name="planId" className="w-full" required>
                {activePlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {formatVnd(p.priceMonthly)}/tháng
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="status">Trạng thái</Label>
                <NativeSelect
                  id="status"
                  name="status"
                  className="w-full"
                  defaultValue="active"
                >
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
              {subscription ? 'Đổi gói' : 'Gán gói'}
            </Button>
          </Form>
        )}
      </CardContent>
    </Card>
  );
}

const domainFields: FieldConfig<AddDomainInput>[] = [
  { name: 'hostname', type: 'text', label: 'Tên miền', placeholder: 'booking.tenant.com' },
  { name: 'isPrimary', type: 'checkbox', label: 'Đặt làm tên miền chính' },
];

function DomainsCard({
  domains,
  busy,
  serverError,
  fieldErrors,
}: {
  domains: DomainResponse[];
  busy: boolean;
  serverError: string | null | undefined;
  fieldErrors: Partial<Record<string, string[] | undefined>> | null | undefined;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe className="size-4 text-muted-foreground" />
          Tên miền
        </CardTitle>
        <CardDescription>Gắn tên miền riêng và xác minh qua bản ghi DNS TXT.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {domains.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có tên miền.</p>
        ) : (
          <ul className="space-y-2">
            {domains.map((d) => (
              <li key={d.id} className="space-y-2 rounded-md border px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{d.hostname}</span>
                  <span className="flex shrink-0 items-center gap-2 text-xs">
                    {d.isPrimary ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                        Chính
                      </span>
                    ) : null}
                    <span
                      className={
                        d.verifiedAt
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }
                    >
                      {d.verifiedAt ? 'Đã xác minh' : 'Chờ xác minh'}
                    </span>
                  </span>
                </div>
                {!d.verifiedAt ? (
                  <div className="space-y-2">
                    {d.verificationToken ? (
                      <div className="rounded-md bg-muted/40 p-2 text-xs">
                        <p className="text-muted-foreground">
                          Thêm bản ghi DNS TXT sau rồi bấm “Xác minh”:
                        </p>
                        <code className="mt-1 block break-all font-mono text-[11px]">
                          {d.verificationToken}
                        </code>
                      </div>
                    ) : null}
                    <Form method="post">
                      <input type="hidden" name="intent" value="verify-domain" />
                      <input type="hidden" name="domainId" value={d.id} />
                      <Button type="submit" variant="outline" size="sm" disabled={busy}>
                        <ShieldCheck className="size-4" />
                        Xác minh
                      </Button>
                    </Form>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-3 border-t pt-4">
          <p className="text-sm font-medium">Thêm tên miền</p>
          <GenericForm
            schema={addDomainInputSchema}
            fields={domainFields}
            submitLabel="Thêm tên miền"
            serverError={serverError}
            fieldErrors={fieldErrors}
            defaultValues={{ hostname: '', isPrimary: false }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
