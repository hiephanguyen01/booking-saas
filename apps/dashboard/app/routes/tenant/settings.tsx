import type {
  CancellationPolicyResponse,
  DomainResponse,
  GatewayConfigResponse,
  TenantThemeResponse,
  PayoutPolicyDto,
} from '@booking/contracts';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@booking/ui/components/ui/tabs';
import { Globe2, Palette, SlidersHorizontal, WalletCards } from 'lucide-react';
import type { Route } from './+types/settings';
import { apiGet } from '~/lib/api.server';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { handleSettingsAction } from '~/features/tenant/server/settings-actions.server';
import {
  TENANT_FLAGS_PATH,
  toPartnerPromotionsState,
  type TenantFlags,
} from '~/features/tenant/lib/flags';
import { useTenantArea } from '~/features/tenant/lib/area-context';
import { PageHeader } from '~/components/page-header';
import { PartnerPromotionsCard } from '~/features/tenant/components/settings/partner-promotions-card';
import { TenantDefaultCancellationPolicyCard } from '~/features/tenant/components/settings/tenant-default-cancellation-policy-card';
import { TenantDomainsCard } from '~/features/tenant/components/settings/tenant-domains-card';
import { ThemeSettingsCard } from '~/features/tenant/components/settings/theme-settings-card';
import { PaymentGatewayCard } from '~/features/tenant/components/settings/payment-gateway-card';
import { PayoutPolicyCard } from '~/features/tenant/components/settings/payout-policy-card';

const SETTINGS_TAB_BY_FORM: Record<string, string> = {
  theme: 'brand',
  domain: 'domains',
  verify: 'domains',
  flags: 'operations',
  'cancellation-default': 'operations',
  sepay: 'payments',
  momo: 'payments',
  'gateway-off': 'payments',
  'payout-policy': 'payments',
};

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Cài đặt · Tenant · Bookify' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, can } = await requireTenant(request);
  const [themeRes, domainsRes, flagsRes, policiesRes, gatewayRes, payoutPolicyRes] = await Promise.all([
    can('tenant.theme.manage')
      ? apiGet<TenantThemeResponse>('/tenant/theme', auth)
      : Promise.resolve(null),
    can('tenant.settings.manage')
      ? apiGet<DomainResponse[]>('/tenant/domains', auth)
      : Promise.resolve(null),
    can('tenant.settings.manage')
      ? apiGet<TenantFlags>(TENANT_FLAGS_PATH, auth)
      : Promise.resolve(null),
    can('tenant.settings.manage')
      ? apiGet<CancellationPolicyResponse[]>('/tenant/cancellation-policies', auth)
      : Promise.resolve(null),
    can('tenant.settings.manage')
      ? apiGet<GatewayConfigResponse | null>('/tenant/gateway-config', auth)
      : Promise.resolve(null),
    can('tenant.finance.read')
      ? apiGet<PayoutPolicyDto>('/tenant/finance/payout-policy', auth)
      : Promise.resolve(null),
  ]);
  return {
    theme: themeRes?.ok ? themeRes.data : null,
    domains: domainsRes?.ok ? (domainsRes.data ?? []) : null,
    canTheme: can('tenant.theme.manage'),
    canDomains: can('tenant.settings.manage'),
    // An explicit read state, never a bare boolean: a failed read must not be
    // indistinguishable from a flag that is genuinely off.
    partnerPromotions: toPartnerPromotionsState(flagsRes),
    cancellationPolicies: policiesRes?.ok ? (policiesRes.data ?? []) : [],
    gatewayConfig: gatewayRes?.ok ? (gatewayRes.data ?? null) : null,
    payoutPolicy: payoutPolicyRes?.ok ? (payoutPolicyRes.data ?? null) : null,
    canManagePayoutPolicy: can('tenant.payouts.manage'),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth } = await requireTenant(request);
  return handleSettingsAction(request, auth);
}

export default function TenantSettings({ loaderData, actionData }: Route.ComponentProps) {
  const {
    theme,
    domains,
    canTheme,
    canDomains,
    partnerPromotions,
    cancellationPolicies,
    gatewayConfig,
    payoutPolicy,
    canManagePayoutPolicy,
  } = loaderData;
  const { readOnly } = useTenantArea();

  // Feedback narrowing: every action branch tags its result with `form`, so each
  // card only surfaces the outcome of ITS OWN submission.
  const errFor = (form: string): string | null => {
    if (
      actionData &&
      'form' in actionData &&
      actionData.form === form &&
      'error' in actionData &&
      typeof actionData.error === 'string'
    ) {
      return actionData.error;
    }
    return null;
  };
  const okFor = (form: string): boolean =>
    !!actionData && 'form' in actionData && actionData.form === form && 'ok' in actionData;

  const fieldErrorsFor = (form: string): Record<string, string[]> | null =>
    actionData && 'form' in actionData && actionData.form === form && 'fieldErrors' in actionData
      ? ((actionData.fieldErrors as Record<string, string[]> | undefined) ?? null)
      : null;

  const settingsTabs = [
    canTheme && theme
      ? {
          value: 'brand',
          label: 'Thương hiệu',
          description: 'Giao diện storefront',
          icon: Palette,
        }
      : null,
    canDomains
      ? {
          value: 'domains',
          label: 'Tên miền',
          description: 'Địa chỉ cửa hàng',
          icon: Globe2,
        }
      : null,
    canDomains
      ? {
          value: 'operations',
          label: 'Vận hành',
          description: 'Quy tắc đặt chỗ',
          icon: SlidersHorizontal,
        }
      : null,
    canDomains || payoutPolicy
      ? {
          value: 'payments',
          label: 'Thanh toán',
          description: 'Thu tiền & chi trả',
          icon: WalletCards,
        }
      : null,
  ].filter((tab) => tab !== null);
  const feedbackForm =
    actionData && 'form' in actionData && typeof actionData.form === 'string'
      ? actionData.form
      : null;
  const feedbackTab = feedbackForm ? SETTINGS_TAB_BY_FORM[feedbackForm] : null;
  const defaultTab =
    settingsTabs.find((tab) => tab.value === feedbackTab)?.value ?? settingsTabs[0]?.value;
  const mobileTabGridClass = settingsTabs.length === 1 ? 'grid-cols-1' : 'grid-cols-2';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cài đặt"
        description="Quản lý thương hiệu, vận hành và dòng tiền của cửa hàng tại một nơi."
      />

      {defaultTab ? (
        <Tabs
          defaultValue={defaultTab}
          orientation="vertical"
          className="flex-col gap-5 lg:flex-row lg:items-start lg:gap-8"
        >
          <TabsList
            aria-label="Nhóm cài đặt"
            className={`grid h-auto w-full shrink-0 gap-1.5 rounded-xl border bg-card p-2 shadow-xs lg:sticky lg:top-6 lg:w-64 lg:grid-cols-1 xl:w-72 ${mobileTabGridClass}`}
          >
            {settingsTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="group h-auto min-h-14 justify-start gap-3 rounded-lg px-2.5 py-2.5 text-left text-foreground/70 shadow-none hover:bg-muted/70 hover:text-foreground active:scale-[0.99] data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-primary/15"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-data-[state=active]:bg-primary group-data-[state=active]:text-primary-foreground">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold leading-5">{tab.label}</span>
                    <span className="hidden truncate text-xs font-normal text-muted-foreground lg:block">
                      {tab.description}
                    </span>
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {canTheme && theme ? (
            <TabsContent value="brand" className="min-w-0 w-full lg:max-w-5xl">
              <ThemeSettingsCard
                theme={theme}
                readOnly={readOnly}
                saved={okFor('theme')}
                error={errFor('theme')}
                fieldErrors={fieldErrorsFor('theme')}
              />
            </TabsContent>
          ) : null}

          {canDomains ? (
            <TabsContent value="domains" className="min-w-0 w-full lg:max-w-5xl">
              <TenantDomainsCard
                domains={domains}
                readOnly={readOnly}
                verifyError={errFor('verify')}
                domainError={errFor('domain')}
                domainFieldErrors={fieldErrorsFor('domain')}
              />
            </TabsContent>
          ) : null}

          {canDomains ? (
            <TabsContent value="operations" className="min-w-0 w-full space-y-5 lg:max-w-5xl">
              {partnerPromotions ? (
                <PartnerPromotionsCard
                  state={partnerPromotions}
                  readOnly={readOnly}
                  error={errFor('flags')}
                />
              ) : null}
              <TenantDefaultCancellationPolicyCard
                policies={cancellationPolicies}
                readOnly={readOnly}
                error={errFor('cancellation-default')}
                saved={okFor('cancellation-default')}
              />
            </TabsContent>
          ) : null}

          {canDomains || payoutPolicy ? (
            <TabsContent value="payments" className="min-w-0 w-full space-y-5 lg:max-w-5xl">
              {canDomains ? (
                <PaymentGatewayCard
                  config={gatewayConfig}
                  readOnly={readOnly}
                  sepaySaved={okFor('sepay')}
                  sepayError={errFor('sepay')}
                  sepayFieldErrors={fieldErrorsFor('sepay')}
                  momoSaved={okFor('momo')}
                  momoError={errFor('momo')}
                  momoFieldErrors={fieldErrorsFor('momo')}
                  offError={errFor('gateway-off')}
                />
              ) : null}
              {payoutPolicy ? (
                <PayoutPolicyCard
                  policy={payoutPolicy}
                  readOnly={readOnly || !canManagePayoutPolicy}
                  saved={okFor('payout-policy')}
                  error={errFor('payout-policy')}
                />
              ) : null}
            </TabsContent>
          ) : null}
        </Tabs>
      ) : null}

      {!canTheme && !canDomains && !payoutPolicy ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Bạn không có quyền chỉnh sửa cài đặt.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
