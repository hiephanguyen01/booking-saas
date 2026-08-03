import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { Button } from '@booking/ui/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@booking/ui/components/ui/tabs';
import {
  CircleAlert,
  CreditCard,
  ExternalLink,
  Globe2,
  LayoutDashboard,
  Palette,
  Scale,
  SlidersHorizontal,
  WalletCards,
} from 'lucide-react';
import { useSearchParams } from 'react-router';
import type { Route } from './+types/settings';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { handleSettingsAction } from '~/features/tenant/server/settings-actions.server';
import { useTenantArea } from '~/features/tenant/lib/area-context';
import { PageHeader } from '~/components/page-header';
import { LegalDocumentsCard } from '~/features/tenant/components/settings/legal-documents-card';
import { PartnerPromotionsCard } from '~/features/tenant/components/settings/partner-promotions-card';
import { TenantDefaultCancellationPolicyCard } from '~/features/tenant/components/settings/tenant-default-cancellation-policy-card';
import { TenantDomainsCard } from '~/features/tenant/components/settings/tenant-domains-card';
import { ThemeSettingsCard } from '~/features/tenant/components/settings/theme-settings-card';
import { PaymentGatewayCard } from '~/features/tenant/components/settings/payment-gateway-card';
import { PayoutPolicyCard } from '~/features/tenant/components/settings/payout-policy-card';
import { PaymentMethodSettingsCard } from '~/features/tenant/components/settings/payment-method-settings-card';
import { SettingsOverview } from '~/features/tenant/components/settings/settings-overview';
import { loadTenantSettings } from '~/features/tenant/server/settings-loader.server';

const SETTINGS_TAB_BY_FORM: Record<string, string> = {
  theme: 'brand',
  domain: 'domains',
  'domain-verify': 'domains',
  'domain-primary': 'domains',
  'domain-delete': 'domains',
  flags: 'operations',
  'cancellation-default': 'operations',
  'cancellation-policy-create': 'operations',
  'cancellation-policy-update': 'operations',
  'cancellation-policy-delete': 'operations',
  sepay: 'payments',
  momo: 'payments',
  zalopay: 'payments',
  'gateway-off': 'payments',
  'payment-settings': 'payments',
  'payout-policy': 'payouts',
  'legal-draft': 'legal',
  'legal-publish': 'legal',
  'legal-withdraw': 'legal',
};

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Cài đặt cửa hàng | BookingOS' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  return loadTenantSettings(request);
}

export async function action({ request }: Route.ActionArgs) {
  const { auth } = await requireTenant(request);
  return handleSettingsAction(request, auth);
}

export default function TenantSettings({ loaderData, actionData }: Route.ComponentProps) {
  const {
    theme,
    themeError,
    domains,
    domainsError,
    canTheme,
    canSettings,
    canFinance,
    canLegal,
    partnerPromotions,
    cancellationPolicies,
    cancellationPoliciesError,
    gatewayConfigs,
    gatewayError,
    payoutPolicy,
    payoutPolicyError,
    canManagePayoutPolicy,
    legal,
    legalError,
  } = loaderData;
  const baseGatewayConfig =
    gatewayConfigs?.find((c) => c.gateway !== 'momo' && c.gateway !== 'zalopay') ?? null;
  const { readOnly, subscription } = useTenantArea();
  const [searchParams, setSearchParams] = useSearchParams();

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
    Boolean(actionData && 'form' in actionData && actionData.form === form && 'ok' in actionData);
  const fieldErrorsFor = (form: string): Record<string, string[]> | null =>
    actionData && 'form' in actionData && actionData.form === form && 'fieldErrors' in actionData
      ? ((actionData.fieldErrors as Record<string, string[]> | undefined) ?? null)
      : null;

  const settingsTabs = [
    {
      value: 'overview',
      label: 'Tổng quan',
      icon: LayoutDashboard,
    },
    canTheme ? { value: 'brand', label: 'Thương hiệu', icon: Palette } : null,
    canSettings ? { value: 'domains', label: 'Tên miền', icon: Globe2 } : null,
    canSettings
      ? {
          value: 'operations',
          label: 'Vận hành',
          icon: SlidersHorizontal,
        }
      : null,
    canSettings
      ? {
          value: 'payments',
          label: 'Thanh toán',
          icon: CreditCard,
        }
      : null,
    canFinance
      ? {
          value: 'payouts',
          label: 'Chi trả đối tác',
          icon: WalletCards,
        }
      : null,
    canLegal
      ? {
          value: 'legal',
          label: 'Pháp lý',
          icon: Scale,
        }
      : null,
  ].filter((tab) => tab !== null);

  const feedbackForm =
    actionData && 'form' in actionData && typeof actionData.form === 'string'
      ? actionData.form
      : null;
  const feedbackTab = feedbackForm ? SETTINGS_TAB_BY_FORM[feedbackForm] : null;
  const requestedTab = searchParams.get('section');
  const activeTab =
    settingsTabs.find((tab) => tab.value === requestedTab)?.value ??
    settingsTabs.find((tab) => tab.value === feedbackTab)?.value ??
    'overview';
  const primaryDomain = domains?.find((domain) => domain.isPrimary && domain.verifiedAt) ?? null;
  const publicUrl = primaryDomain ? storefrontUrl(primaryDomain.hostname) : null;

  const selectTab = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('section', value);
    setSearchParams(next, { preventScrollReset: true, replace: true });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cài đặt cửa hàng"
        description="Quản lý nhận diện, vận hành và dòng tiền của storefront tại một nơi."
        actions={
          publicUrl ? (
            <Button asChild variant="outline">
              <a href={publicUrl} target="_blank" rel="noreferrer">
                Mở storefront <ExternalLink className="size-4" />
              </a>
            </Button>
          ) : null
        }
      />

      <Tabs value={activeTab} onValueChange={selectTab} className="gap-5">
        <div className="sticky top-20 z-10 -mx-1 overflow-x-auto rounded-xl border bg-background/95 p-1.5 shadow-xs backdrop-blur-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsList
            aria-label="Nhóm cài đặt"
            className="h-auto min-w-max w-full justify-start gap-1 bg-transparent p-0"
          >
            {settingsTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="min-h-11 min-w-36 flex-1 justify-center gap-2 rounded-lg px-3.5 py-2 font-semibold text-foreground/60 shadow-none hover:bg-muted/60 hover:text-foreground active:scale-[0.98] data-[state=active]:border-border data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm dark:data-[state=active]:border-border dark:data-[state=active]:bg-muted/70 sm:min-w-40 lg:min-w-0"
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {tab.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <div className="min-w-0">
          <TabsContent value="overview" forceMount className="w-full data-[state=inactive]:hidden">
            <SettingsOverview
              theme={theme}
              themeError={themeError}
              domains={domains}
              domainsError={domainsError}
              cancellationPolicies={cancellationPolicies}
              cancellationPoliciesError={cancellationPoliciesError}
              gatewayConfig={baseGatewayConfig}
              gatewayError={gatewayError}
              payoutPolicy={payoutPolicy}
              payoutPolicyError={payoutPolicyError}
              subscription={subscription}
              canTheme={canTheme}
              canSettings={canSettings}
              canFinance={canFinance}
            />
          </TabsContent>

          {canTheme ? (
            <TabsContent value="brand" forceMount className="w-full data-[state=inactive]:hidden">
              {theme ? (
                <ThemeSettingsCard
                  theme={theme}
                  storefrontUrl={publicUrl}
                  readOnly={readOnly}
                  saved={okFor('theme')}
                  error={errFor('theme')}
                  fieldErrors={fieldErrorsFor('theme')}
                />
              ) : (
                <SettingsLoadError message={themeError ?? 'Không có dữ liệu thương hiệu.'} />
              )}
            </TabsContent>
          ) : null}

          {canSettings ? (
            <TabsContent value="domains" forceMount className="w-full data-[state=inactive]:hidden">
              <TenantDomainsCard
                domains={domains}
                loadError={domainsError}
                readOnly={readOnly}
                actionError={
                  errFor('domain-verify') ?? errFor('domain-primary') ?? errFor('domain-delete')
                }
                domainError={errFor('domain')}
                domainFieldErrors={fieldErrorsFor('domain')}
                successMessage={
                  okFor('domain')
                    ? 'Đã thêm tên miền. Hãy cấu hình DNS để hoàn tất xác minh.'
                    : okFor('domain-verify')
                      ? 'Đã gửi yêu cầu kiểm tra DNS. Trạng thái sẽ cập nhật khi bản ghi được tìm thấy.'
                      : okFor('domain-primary')
                        ? 'Đã cập nhật tên miền chính của storefront.'
                        : okFor('domain-delete')
                          ? 'Đã xoá tên miền khỏi storefront.'
                          : null
                }
              />
            </TabsContent>
          ) : null}

          {canSettings ? (
            <TabsContent
              value="operations"
              forceMount
              className="w-full space-y-5 data-[state=inactive]:hidden"
            >
              {partnerPromotions ? (
                <PartnerPromotionsCard
                  state={partnerPromotions}
                  readOnly={readOnly}
                  error={errFor('flags')}
                  saved={okFor('flags')}
                />
              ) : null}
              <TenantDefaultCancellationPolicyCard
                policies={cancellationPolicies}
                loadError={cancellationPoliciesError}
                readOnly={readOnly}
                error={errFor('cancellation-default')}
                saved={okFor('cancellation-default')}
                manageError={
                  errFor('cancellation-policy-create') ??
                  errFor('cancellation-policy-update') ??
                  errFor('cancellation-policy-delete')
                }
                manageFieldErrors={
                  fieldErrorsFor('cancellation-policy-create') ??
                  fieldErrorsFor('cancellation-policy-update')
                }
                manageSuccess={
                  okFor('cancellation-policy-create')
                    ? 'Đã tạo chính sách huỷ cấp tổ chức.'
                    : okFor('cancellation-policy-update')
                      ? 'Đã cập nhật chính sách huỷ.'
                      : okFor('cancellation-policy-delete')
                        ? 'Đã xoá chính sách huỷ.'
                        : null
                }
              />
            </TabsContent>
          ) : null}

          {canSettings ? (
            <TabsContent
              value="payments"
              forceMount
              className="w-full space-y-5 data-[state=inactive]:hidden"
            >
              <PaymentGatewayCard
                configs={gatewayConfigs ?? []}
                readOnly={readOnly}
                sepaySaved={okFor('sepay')}
                sepayError={errFor('sepay')}
                sepayFieldErrors={fieldErrorsFor('sepay')}
                momoSaved={okFor('momo')}
                momoError={errFor('momo')}
                momoFieldErrors={fieldErrorsFor('momo')}
                zalopaySaved={okFor('zalopay')}
                zalopayError={errFor('zalopay')}
                zalopayFieldErrors={fieldErrorsFor('zalopay')}
                offError={errFor('gateway-off')}
              />
              {!gatewayError ? (
                baseGatewayConfig ? (
                  <PaymentMethodSettingsCard
                    settings={baseGatewayConfig.settings}
                    gateway={baseGatewayConfig.gateway}
                    readOnly={readOnly}
                    error={errFor('payment-settings')}
                    success={okFor('payment-settings')}
                  />
                ) : (gatewayConfigs?.length ?? 0) > 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Ví điện tử dùng cấu hình hoàn tiền tự động mặc định. Bật một cổng cơ bản (SePay)
                    để tuỳ chỉnh phương thức hiển thị và chính sách hoàn tiền.
                  </p>
                ) : null
              ) : null}
            </TabsContent>
          ) : null}

          {canFinance ? (
            <TabsContent value="payouts" forceMount className="w-full data-[state=inactive]:hidden">
              {payoutPolicy ? (
                <PayoutPolicyCard
                  policy={payoutPolicy}
                  readOnly={readOnly || !canManagePayoutPolicy}
                  saved={okFor('payout-policy')}
                  error={errFor('payout-policy')}
                />
              ) : (
                <SettingsLoadError message={payoutPolicyError ?? 'Không có dữ liệu chi trả.'} />
              )}
            </TabsContent>
          ) : null}

          {canLegal ? (
            <TabsContent value="legal" forceMount className="w-full data-[state=inactive]:hidden">
              <LegalDocumentsCard
                overview={legal}
                loadError={legalError}
                readOnly={readOnly}
                draftError={errFor('legal-draft')}
                draftFieldErrors={fieldErrorsFor('legal-draft')}
                draftSaved={okFor('legal-draft')}
                publishError={errFor('legal-publish')}
                publishSaved={okFor('legal-publish')}
                withdrawError={errFor('legal-withdraw')}
                withdrawSaved={okFor('legal-withdraw')}
              />
            </TabsContent>
          ) : null}
        </div>
      </Tabs>
    </div>
  );
}

function SettingsLoadError({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <CircleAlert className="size-4" />
      <AlertDescription>{message} Hãy tải lại trang hoặc thử lại sau.</AlertDescription>
    </Alert>
  );
}

function storefrontUrl(hostname: string): string {
  return `${hostname.includes('localhost') || hostname.startsWith('127.') ? 'http' : 'https'}://${hostname}`;
}
