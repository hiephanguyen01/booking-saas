import { useSearchParams } from 'react-router';
import { CalendarClock, ExternalLink, ListChecks, Users } from 'lucide-react';
import {
  currentSubscriptionResponseSchema,
  updateTenantInputSchema,
  type CommissionRuleResponse,
  type DomainResponse,
  type Paginated,
  type PlanResponse,
  type SubscriptionHistoryItem,
  type TenancyConfigResponse,
  type TenantDetailResponse,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { Route } from './+types/detail';
import { apiGet } from '~/lib/api.server';
import { requirePlatform } from '~/features/admin/server/admin.server';
import {
  handleTenantDetailFormAction,
  handleTenantDetailJsonAction,
  type ActionResult,
  type ActionScope,
} from '~/features/admin/server/tenant-detail-actions.server';
import { getSubscriptionDateDefaults } from '~/features/admin/server/subscription-dates.server';
import { tenantEditFields } from '~/features/admin/tenant-form-fields';
import { TenantConfigSection } from '~/features/admin/components/tenant-config-section';
import { TenantDangerSection } from '~/features/admin/components/tenant-danger-section';
import { TenantDomainsCard } from '~/features/admin/components/tenant-domains-card';
import { TenantPlatformRateCard } from '~/features/admin/components/tenant-platform-rate-card';
import { TenantSubscriptionSection } from '~/features/admin/components/tenant-subscription-section';
import { useBusy } from '~/hooks/use-busy';
import { VERTICAL_LABELS } from '~/constants/tenancy';
import { dashboardPaths } from '~/constants/paths';
import { BackLink } from '~/components/back-link';
import { SuccessBanner } from '~/components/action-feedback';
import { PageHeader } from '~/components/page-header';
import { CopyableCode } from '~/components/copyable-code';
import { StatCard } from '~/components/stat-card';
import { DateTimeValue } from '~/components/date-time-value';
import { EnumValue } from '~/components/enum-value';
import { TenantStatusBadge } from '~/components/status-badge';
import { readListParams } from '~/lib/pagination';
import { apiPaths } from '~/constants/api-paths';

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  return [{ title: `${loaderData?.tenant?.name ?? 'Tenant'} · BookingOS Admin` }];
}

export async function loader({ request, params, url }: Route.LoaderArgs) {
  const id = params.id;
  const { auth } = await requirePlatform(request, 'platform.tenants.read');
  const subscriptionDates = getSubscriptionDateDefaults();
  // The subscription-history table is server-paginated with its OWN namespaced params
  // (subPage/subPageSize) so it never collides with anything else on this detail page.
  const { toApiQuery } = readListParams(url.searchParams, {
    pageKey: 'subPage',
    pageSizeKey: 'subPageSize',
  });
  const [tenantRes, subRes, historyRes, domainsRes, tenancyConfigRes, plansRes, rulesRes] =
    await Promise.all([
      apiGet<TenantDetailResponse>(apiPaths.admin.tenant(id), auth),
      apiGet(apiPaths.admin.tenantSubscription(id), auth, {
        schema: currentSubscriptionResponseSchema.nullable(),
      }),
      apiGet<Paginated<SubscriptionHistoryItem>>(apiPaths.admin.tenantSubscriptions(id), auth, {
        query: toApiQuery(),
      }),
      apiGet<DomainResponse[]>(apiPaths.admin.tenantDomains(id), auth),
      apiGet<TenancyConfigResponse>(apiPaths.admin.tenancyConfig, auth),
      apiGet<PlanResponse[]>(apiPaths.admin.plans, auth),
      // Read from finance, not the tenant-detail response: `finance` already
      // imports `TenancyModule`, so having tenancy read commission rules back
      // would close a module cycle the API's module-cycle guard rejects.
      apiGet<CommissionRuleResponse[]>(apiPaths.platform.tenantCommissionRules(id), auth),
    ]);
  if (!tenantRes.ok || !tenantRes.data) {
    throw new Response('Không tìm thấy tenant', { status: tenantRes.status || 404 });
  }
  return {
    tenant: tenantRes.data,
    subscription: subRes.ok ? subRes.data : null,
    // null → the history fetch itself failed (render the failed state); [] → no history yet.
    history: historyRes.ok ? (historyRes.data?.items ?? []) : null,
    historyTotal: historyRes.ok ? (historyRes.data?.total ?? 0) : 0,
    domains: domainsRes.ok ? (domainsRes.data ?? []) : [],
    // Only the "point your domain here" hints depend on it; the rest of the card
    // works without it.
    tenancyConfig: tenancyConfigRes.ok ? (tenancyConfigRes.data ?? null) : null,
    plans: plansRes.ok ? (plansRes.data ?? []) : [],
    // null → no rule to read the fee from (or the fetch failed); the card then
    // explains rather than offering an input that would write nothing.
    platformRate:
      (rulesRes.ok ? rulesRes.data : null)?.find((r) => r.appliesTo === 'tenant_default')
        ?.platformRate ?? null,
    subscriptionDates,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  // The tenant-edit and add-domain GenericForms both submit JSON to this route;
  // the quick actions (verify/remove domain, set status, assign subscription)
  // submit urlencoded FormData.
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return handleTenantDetailJsonAction(request, params.id);
  }
  return handleTenantDetailFormAction(request, params.id);
}

export default function TenantDetail({ loaderData, actionData }: Route.ComponentProps) {
  const {
    tenant,
    subscription,
    history,
    historyTotal,
    domains,
    tenancyConfig,
    plans,
    platformRate,
    subscriptionDates,
  } = loaderData;
  const busy = useBusy();
  const [searchParams] = useSearchParams();
  const {
    page: subPage,
    pageSize: subPageSize,
    pageHref: subPageHref,
  } = readListParams(searchParams, { pageKey: 'subPage', pageSizeKey: 'subPageSize' });

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
        <BackLink to={dashboardPaths.admin.tenants} label="Danh sách tenant" />
        <PageHeader
          title={tenant.name}
          description="Thông tin, gói dịch vụ và hoạt động của tenant."
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <TenantStatusBadge status={tenant.status} />
              {storefrontUrl ? (
                <Button asChild variant="outline">
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
            <dt className="text-muted-foreground">Slug</dt>
            <dd>
              <CopyableCode value={tenant.slug} label="slug tenant" />
            </dd>
          </div>
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

      <SuccessBanner message={okMessage} />

      {/* Sức khoẻ — the aggregate counts, up top. */}
      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Partner"
          value={tenant.counts.partners.toLocaleString('vi-VN')}
          icon={<Users className="size-4" />}
        />
        <StatCard
          label="Tin đăng"
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
              fields={tenantEditFields}
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

        <TenantDomainsCard
          domains={domains}
          tenancyConfig={tenancyConfig}
          dnsCheck={
            result?.scope === 'domain' && result.domainId && result.dnsCheck
              ? { domainId: result.domainId, result: result.dnsCheck }
              : null
          }
          busy={busy}
          customDomainAllowed={subscription?.plan?.limits.customDomain ?? true}
          serverError={scopedError('domain')}
          fieldErrors={scopedFieldErrors('domain')}
        />
      </div>

      <TenantSubscriptionSection
        subscription={subscription}
        history={history}
        historyTotal={historyTotal}
        page={subPage}
        pageSize={subPageSize}
        pageHref={subPageHref}
        plans={plans}
        busy={busy}
        serverError={scopedError('subscription')}
        minDate={subscriptionDates.minDate}
        defaultExpiry={subscriptionDates.defaultExpiry}
      />

      <TenantPlatformRateCard
        platformRate={platformRate}
        busy={busy}
        error={scopedError('platform-rate')}
      />

      <TenantConfigSection tenant={tenant} />

      <TenantDangerSection status={tenant.status} busy={busy} error={scopedError('status')} />
    </div>
  );
}
