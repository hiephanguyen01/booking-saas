import { data, Form, Link, redirect, useNavigation } from 'react-router';
import {
  ArrowLeft,
  CalendarClock,
  ChevronDown,
  ExternalLink,
  Globe,
  ListChecks,
  PauseCircle,
  PlayCircle,
  Settings2,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import {
  addDomainInputSchema,
  assignSubscriptionInputSchema,
  updateTenantInputSchema,
  type AddDomainInput,
  type DomainResponse,
  type DomainVerificationResult,
  type Locale,
  type PlanResponse,
  type SubscriptionHistoryItem,
  type SubscriptionResponse,
  type TenantDetailResponse,
  type UpdateTenantInput,
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@booking/ui/components/ui/collapsible';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { NativeSelect } from '@booking/ui/components/ui/native-select';
import { Textarea } from '@booking/ui/components/ui/textarea';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { DetailField } from '@booking/ui/components/detail/detail-field';
import { DetailGrid } from '@booking/ui/components/detail/detail-grid';
import { DetailSection } from '@booking/ui/components/detail/detail-section';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import type { Route } from './+types/detail';
import { apiDelete, apiGet, apiPatch, apiPost } from '~/lib/api.server';
import { requirePlatform } from '~/features/admin/server/admin.server';
import { LOCALE_LABELS, SUBSCRIPTION_STATUS_LABELS, VERTICAL_LABELS } from '~/constants/tenancy';
import { PageHeader } from '~/components/page-header';
import { StatCard } from '~/components/stat-card';
import { Money } from '~/components/money';
import { DateTimeValue } from '~/components/date-time-value';
import { EnumValue } from '~/components/enum-value';
import { CopyableCode } from '~/components/copyable-code';
import { SubscriptionStatusBadge, TenantStatusBadge } from '~/components/status-badge';

/** `GET /admin/tenants/:id/subscription` — the current subscription with its plan resolved. */
interface CurrentSubscription {
  subscription: SubscriptionResponse;
  plan: PlanResponse | null;
}


/** Which form/card an action result belongs to, so an error stays in its own card. */
type ActionScope = 'tenant' | 'domain' | 'subscription' | 'status';

interface ActionResult {
  scope: ActionScope;
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Partial<Record<string, string[] | undefined>>;
}

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  return [{ title: `${loaderData?.tenant?.name ?? 'Tenant'} · Bookify Admin` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const id = params.id;
  const { auth } = await requirePlatform(request, 'platform.tenants.read');
  const [tenantRes, subRes, historyRes, domainsRes, plansRes] = await Promise.all([
    apiGet<TenantDetailResponse>(`/admin/tenants/${id}`, auth),
    apiGet<CurrentSubscription | null>(`/admin/tenants/${id}/subscription`, auth),
    apiGet<SubscriptionHistoryItem[]>(`/admin/tenants/${id}/subscriptions`, auth),
    apiGet<DomainResponse[]>(`/admin/tenants/${id}/domains`, auth),
    apiGet<PlanResponse[]>('/admin/plans', auth),
  ]);
  if (!tenantRes.ok || !tenantRes.data) {
    throw new Response('Không tìm thấy tenant', { status: tenantRes.status || 404 });
  }
  return {
    tenant: tenantRes.data,
    subscription: subRes.ok ? subRes.data : null,
    // null → the history fetch itself failed (render the failed state); [] → no history yet.
    history: historyRes.ok ? (historyRes.data ?? []) : null,
    domains: domainsRes.ok ? (domainsRes.data ?? []) : [],
    plans: plansRes.ok ? (plansRes.data ?? []) : [],
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const id = params.id;
  const contentType = request.headers.get('content-type') ?? '';

  // The tenant-edit and add-domain GenericForms both submit JSON to this route;
  // the quick actions (verify/remove domain, set status, assign subscription)
  // submit urlencoded FormData.
  if (contentType.includes('application/json')) {
    const body: unknown = await request.json();
    const { auth } = await requirePlatform(request, 'platform.tenants.write');

    // Discriminate on `hostname`, which exists only in the add-domain payload.
    if (body && typeof body === 'object' && 'hostname' in body) {
      const parsed = addDomainInputSchema.safeParse(body);
      if (!parsed.success) {
        return data<ActionResult>(
          { scope: 'domain', fieldErrors: parsed.error.flatten().fieldErrors },
          { status: 400 },
        );
      }
      const res = await apiPost<DomainResponse>(`/admin/tenants/${id}/domains`, parsed.data, auth);
      if (!res.ok) {
        return data<ActionResult>(
          { scope: 'domain', error: res.error, fieldErrors: res.errors },
          { status: 400 },
        );
      }
      return data<ActionResult>({ scope: 'domain', ok: true, message: 'Đã thêm tên miền.' });
    }

    const parsed = updateTenantInputSchema.safeParse(body);
    if (!parsed.success) {
      return data<ActionResult>(
        { scope: 'tenant', fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const res = await apiPatch<TenantDetailResponse>(`/admin/tenants/${id}`, parsed.data, auth);
    if (!res.ok) {
      return data<ActionResult>(
        { scope: 'tenant', error: res.error, fieldErrors: res.errors },
        { status: 400 },
      );
    }
    return data<ActionResult>({ scope: 'tenant', ok: true, message: 'Đã cập nhật tenant.' });
  }

  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  const permission =
    intent === 'assign-subscription' ? 'platform.subscriptions.manage' : 'platform.tenants.write';
  const { auth } = await requirePlatform(request, permission);

  if (intent === 'verify-domain') {
    const domainId = String(form.get('domainId') ?? '');
    const res = await apiPost<DomainVerificationResult>(
      `/admin/tenants/${id}/domains/${domainId}/verify`,
      {},
      auth,
    );
    if (!res.ok) return data<ActionResult>({ scope: 'domain', error: res.error }, { status: 400 });
    const message =
      res.data?.status === 'verified'
        ? 'Tên miền đã được xác minh.'
        : 'Đang kiểm tra bản ghi DNS, vui lòng thử lại sau ít phút.';
    return data<ActionResult>({ scope: 'domain', ok: true, message });
  }

  if (intent === 'remove-domain') {
    const domainId = String(form.get('domainId') ?? '');
    const res = await apiDelete(`/admin/tenants/${id}/domains/${domainId}`, auth);
    if (!res.ok) {
      const message =
        res.code === 'DOMAIN_PRIMARY_REQUIRED'
          ? 'Không thể xoá tên miền chính. Đặt một tên miền khác làm chính trước.'
          : (res.error ?? 'Không xoá được tên miền.');
      return data<ActionResult>({ scope: 'domain', error: message }, { status: 400 });
    }
    return data<ActionResult>({ scope: 'domain', ok: true, message: 'Đã xoá tên miền.' });
  }

  if (intent === 'set-status') {
    const status = String(form.get('status') ?? '');
    const res = await apiPatch<TenantDetailResponse>(`/admin/tenants/${id}`, { status }, auth);
    if (!res.ok) return data<ActionResult>({ scope: 'status', error: res.error }, { status: 400 });
    return data<ActionResult>({ scope: 'status', ok: true, message: 'Đã cập nhật trạng thái.' });
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
      return data<ActionResult>(
        {
          scope: 'subscription',
          error: 'Dữ liệu gói không hợp lệ.',
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }
    const res = await apiPost<SubscriptionResponse>(
      `/admin/tenants/${id}/subscription`,
      parsed.data,
      auth,
    );
    if (!res.ok)
      return data<ActionResult>({ scope: 'subscription', error: res.error }, { status: 400 });
    return redirect(`/admin/tenants/${id}`);
  }

  return data<ActionResult>({ scope: 'tenant', error: 'Hành động không hợp lệ.' }, { status: 400 });
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
  const { tenant, subscription, history, domains, plans } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';

  const result = (actionData ?? null) as ActionResult | null;
  const scopedError = (scope: ActionScope): string | null =>
    result?.scope === scope && result.error ? result.error : null;
  const scopedFieldErrors = (
    scope: ActionScope,
  ): Partial<Record<string, string[] | undefined>> | null =>
    result?.scope === scope ? (result.fieldErrors ?? null) : null;
  const okMessage = result?.ok && result.message ? result.message : null;

  const storefrontHost = tenant.primaryDomain?.hostname ?? null;
  const storefrontUrl = storefrontHost ? `https://${storefrontHost}` : null;

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link to="/admin/tenants">
            <ArrowLeft className="size-4" />
            Danh sách tenant
          </Link>
        </Button>
        <PageHeader
          title={tenant.name}
          description={tenant.slug}
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <TenantStatusBadge status={tenant.status} />
              {storefrontUrl ? (
                <Button asChild variant="outline" size="sm">
                  <a href={storefrontUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="size-4" />
                    Mở storefront
                  </a>
                </Button>
              ) : null}
            </div>
          }
        />
        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div className="flex items-center gap-2">
            <dt className="text-muted-foreground">Loại hình</dt>
            <dd className="font-medium">
              <EnumValue map={VERTICAL_LABELS} value={tenant.vertical} />
            </dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="text-muted-foreground">Tạo lúc</dt>
            <dd>
              <DateTimeValue iso={tenant.createdAt} />
            </dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="text-muted-foreground">Cập nhật</dt>
            <dd>
              <DateTimeValue iso={tenant.updatedAt} relative />
            </dd>
          </div>
        </dl>
      </div>

      {okMessage ? (
        <div
          role="status"
          className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300"
        >
          {okMessage}
        </div>
      ) : null}

      {/* Sức khoẻ — the aggregate counts, up top. */}
      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Partner"
          value={tenant.counts.partners.toLocaleString('vi-VN')}
          icon={<Users className="size-4" />}
        />
        <StatCard
          label="Listing"
          value={tenant.counts.listings.toLocaleString('vi-VN')}
          icon={<ListChecks className="size-4" />}
        />
        <StatCard
          label="Booking (30 ngày)"
          value={tenant.counts.bookings30d.toLocaleString('vi-VN')}
          icon={<CalendarClock className="size-4" />}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Thông tin tenant</CardTitle>
            <CardDescription>Cập nhật thông tin cơ bản của tenant.</CardDescription>
          </CardHeader>
          <CardContent>
            <GenericForm
              schema={updateTenantInputSchema}
              fields={editFields}
              columns={2}
              submitLabel="Lưu thay đổi"
              method="patch"
              serverError={scopedError('tenant')}
              fieldErrors={scopedFieldErrors('tenant')}
              defaultValues={{
                name: tenant.name,
                vertical: tenant.vertical,
                defaultTimezone: tenant.defaultTimezone,
                defaultLocale: tenant.defaultLocale,
              }}
            />
          </CardContent>
        </Card>

        <DomainsCard
          domains={domains}
          busy={busy}
          customDomainAllowed={subscription?.plan?.limits.customDomain ?? true}
          serverError={scopedError('domain')}
          fieldErrors={scopedFieldErrors('domain')}
        />
      </div>

      <SubscriptionSection
        subscription={subscription}
        history={history}
        plans={plans}
        busy={busy}
        serverError={scopedError('subscription')}
      />

      <ConfigSection tenant={tenant} localeLabels={LOCALE_LABELS} />

      <DangerSection status={tenant.status} busy={busy} error={scopedError('status')} />
    </div>
  );
}

function SubscriptionSection({
  subscription,
  history,
  plans,
  busy,
  serverError,
}: {
  subscription: CurrentSubscription | null;
  history: SubscriptionHistoryItem[] | null;
  plans: PlanResponse[];
  busy: boolean;
  serverError: string | null;
}) {
  const activePlans = plans.filter((p) => p.isActive);
  const defaultExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const minDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const plan = subscription?.plan ?? null;

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
            {serverError ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                {serverError}
              </div>
            ) : null}
            {activePlans.length === 0 ? (
              <p className="text-sm text-muted-foreground">
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
                  <Textarea
                    id="note"
                    name="note"
                    rows={2}
                    placeholder="Số hoá đơn, ghi chú nội bộ…"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {subscription ? 'Đổi gói' : 'Gán gói'}
                </Button>
              </Form>
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
            <DataTable
              columns={historyColumns}
              data={history}
              getRowKey={(s) => s.id}
              emptyMessage="Chưa có lịch sử đăng ký."
            />
          ) : null}
        </DetailSection>
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
  customDomainAllowed,
  serverError,
  fieldErrors,
}: {
  domains: DomainResponse[];
  busy: boolean;
  customDomainAllowed: boolean;
  serverError: string | null;
  fieldErrors: Partial<Record<string, string[] | undefined>> | null;
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
                          : 'text-warning'
                      }
                    >
                      {d.verifiedAt ? 'Đã xác minh' : 'Chờ xác minh'}
                    </span>
                  </span>
                </div>
                {d.verifiedAt ? (
                  <p className="text-xs text-muted-foreground">
                    Xác minh lúc <DateTimeValue iso={d.verifiedAt} className="text-xs" />
                  </p>
                ) : (
                  <div className="space-y-2">
                    {d.verificationToken ? (
                      <div className="space-y-1.5 rounded-md bg-muted/40 p-2 text-xs">
                        <p className="text-muted-foreground">
                          Thêm bản ghi DNS TXT sau rồi bấm “Xác minh”:
                        </p>
                        <CopyableCode value={d.verificationToken} label="bản ghi TXT" />
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
                )}
                <Form method="post" className="pt-1">
                  <input type="hidden" name="intent" value="remove-domain" />
                  <input type="hidden" name="domainId" value={d.id} />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    className="h-auto px-2 py-1 text-xs text-destructive hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                    Xoá
                  </Button>
                </Form>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-3 border-t pt-4">
          <p className="text-sm font-medium">Thêm tên miền</p>
          {customDomainAllowed ? (
            <GenericForm
              schema={addDomainInputSchema}
              fields={domainFields}
              submitLabel="Thêm tên miền"
              serverError={serverError}
              fieldErrors={fieldErrors}
              defaultValues={{ hostname: '', isPrimary: false }}
            />
          ) : (
            <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
              Gói hiện tại không cho phép tên miền riêng. Nâng cấp gói của tenant để bật tính năng
              này.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ConfigSection({
  tenant,
  localeLabels,
}: {
  tenant: TenantDetailResponse;
  localeLabels: Record<Locale, string>;
}) {
  const theme = tenant.themeConfig as Record<string, unknown>;
  const settings = tenant.settings as Record<string, unknown>;
  const logoUrl = readString(theme.logoUrl);
  const font = readString(theme.font);
  const primaryColor = readString((theme.colors as Record<string, unknown> | undefined)?.primary);
  const partnerPromotions = readBoolean(settings.partnerPromotionsEnabled);

  return (
    <Collapsible className="rounded-lg border bg-card">
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 rounded-lg px-6 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <span className="flex items-center gap-2 text-base font-semibold">
          <Settings2 className="size-4 text-muted-foreground" />
          Cấu hình
        </span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-6 px-6 pb-6">
        <DetailGrid columns={3}>
          <DetailField label="Múi giờ" value={tenant.defaultTimezone} />
          <DetailField
            label="Ngôn ngữ"
            value={<EnumValue map={localeLabels} value={tenant.defaultLocale} />}
          />
          <DetailField
            label="Màu chủ đạo"
            value={
              primaryColor ? (
                <span className="inline-flex items-center gap-2">
                  <span
                    className="size-4 rounded-sm border border-border"
                    style={{ backgroundColor: primaryColor }}
                    aria-hidden
                  />
                  <span className="font-mono text-xs">{primaryColor}</span>
                </span>
              ) : undefined
            }
            omitWhenEmpty
          />
          <DetailField label="Font" value={font} omitWhenEmpty />
          <DetailField
            label="Logo"
            span={2}
            value={
              logoUrl ? (
                <a
                  href={logoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-primary underline-offset-4 hover:underline"
                >
                  {logoUrl}
                </a>
              ) : undefined
            }
            omitWhenEmpty
          />
        </DetailGrid>

        <DetailSection title="Tuỳ chọn" className="pt-2">
          <DetailGrid columns={3}>
            <DetailField
              label="Partner tự tạo khuyến mãi"
              value={partnerPromotions === undefined ? undefined : partnerPromotions ? 'Bật' : 'Tắt'}
            />
          </DetailGrid>
        </DetailSection>
      </CollapsibleContent>
    </Collapsible>
  );
}

function DangerSection({
  status,
  busy,
  error,
}: {
  status: TenantDetailResponse['status'];
  busy: boolean;
  error: string | null;
}) {
  const suspend = status === 'active';
  const nextStatus = suspend ? 'suspended' : 'active';

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-base text-destructive">Vùng nguy hiểm</CardTitle>
        <CardDescription>
          {suspend
            ? 'Tạm ngưng sẽ đưa storefront của tenant xuống ngay lập tức.'
            : 'Kích hoạt lại để đưa storefront của tenant hoạt động trở lại.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </div>
        ) : null}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant={suspend ? 'destructive' : 'default'} size="sm" disabled={busy}>
              {suspend ? (
                <>
                  <PauseCircle className="size-4" />
                  Tạm ngưng tenant
                </>
              ) : (
                <>
                  <PlayCircle className="size-4" />
                  Kích hoạt tenant
                </>
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{suspend ? 'Tạm ngưng tenant?' : 'Kích hoạt tenant?'}</AlertDialogTitle>
              <AlertDialogDescription>
                {suspend
                  ? 'Storefront sẽ ngừng nhận đơn ngay khi tạm ngưng. Bạn có thể kích hoạt lại bất cứ lúc nào.'
                  : 'Storefront sẽ hoạt động trở lại và tiếp tục nhận đơn.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Huỷ</AlertDialogCancel>
              <Form method="post">
                <input type="hidden" name="intent" value="set-status" />
                <input type="hidden" name="status" value={nextStatus} />
                <AlertDialogAction
                  type="submit"
                  variant={suspend ? 'destructive' : 'default'}
                  disabled={busy}
                >
                  {suspend ? 'Tạm ngưng' : 'Kích hoạt'}
                </AlertDialogAction>
              </Form>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

/** Read a string field from an untrusted jsonb record; '' and non-strings → undefined. */
function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/** Read a boolean field from an untrusted jsonb record; non-booleans → undefined. */
function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}
