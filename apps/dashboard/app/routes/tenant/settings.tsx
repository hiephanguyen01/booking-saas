import type { DomainResponse } from '@booking/contracts';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import type { Route } from './+types/settings';
import { apiGet } from '~/lib/api.server';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { handleSettingsAction } from '~/features/tenant/server/settings-actions.server';
import { TENANT_FLAGS_PATH, toPartnerPromotionsState, type TenantFlags } from '~/features/tenant/lib/flags';
import type { TenantThemeResponse } from '~/features/tenant/components/settings/settings-fields';
import { useTenantArea } from '~/features/tenant/lib/area-context';
import { PageHeader } from '~/components/page-header';
import { PartnerPromotionsCard } from '~/features/tenant/components/settings/partner-promotions-card';
import { TenantDomainsCard } from '~/features/tenant/components/settings/tenant-domains-card';
import { ThemeSettingsCard } from '~/features/tenant/components/settings/theme-settings-card';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Cài đặt · Tenant · Bookify' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, can } = await requireTenant(request);
  const [themeRes, domainsRes, flagsRes] = await Promise.all([
    can('tenant.theme.manage')
      ? apiGet<TenantThemeResponse>('/tenant/theme', auth)
      : Promise.resolve(null),
    can('tenant.settings.manage')
      ? apiGet<DomainResponse[]>('/tenant/domains', auth)
      : Promise.resolve(null),
    can('tenant.settings.manage')
      ? apiGet<TenantFlags>(TENANT_FLAGS_PATH, auth)
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
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth } = await requireTenant(request);
  return handleSettingsAction(request, auth);
}

export default function TenantSettings({ loaderData, actionData }: Route.ComponentProps) {
  const { theme, domains, canTheme, canDomains, partnerPromotions } = loaderData;
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cài đặt"
        description="Tuỳ chỉnh giao diện storefront và tên miền của cửa hàng."
      />

      {canTheme && theme ? (
        <ThemeSettingsCard
          theme={theme}
          readOnly={readOnly}
          saved={okFor('theme')}
          error={errFor('theme')}
          fieldErrors={fieldErrorsFor('theme')}
        />
      ) : null}

      {canDomains ? (
        <TenantDomainsCard
          domains={domains}
          readOnly={readOnly}
          verifyError={errFor('verify')}
          domainError={errFor('domain')}
          domainFieldErrors={fieldErrorsFor('domain')}
        />
      ) : null}

      {canDomains && partnerPromotions ? (
        <PartnerPromotionsCard
          state={partnerPromotions}
          readOnly={readOnly}
          error={errFor('flags')}
        />
      ) : null}

      {!canTheme && !canDomains ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Bạn không có quyền chỉnh sửa cài đặt.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
