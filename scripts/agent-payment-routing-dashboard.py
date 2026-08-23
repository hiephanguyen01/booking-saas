from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if text.count(old) != 1:
        raise SystemExit(f"expected exactly one match in {path}: {old[:80]!r}; got {text.count(old)}")
    p.write_text(text.replace(old, new, 1))


# Central API paths.
replace_once(
    'apps/dashboard/app/constants/api-paths.ts',
    "    gatewayConfig: tenantPath('/gateway-config'),\n    gatewayConfigSettings: tenantPath('/gateway-config/settings'),",
    "    gatewayConfig: tenantPath('/gateway-config'),\n    paymentRouting: tenantPath('/payment-routing'),\n    refundPolicy: tenantPath('/refund-policy'),",
)

# Settings actions: schemas + PayOS credential branch + routing/refund mutations.
actions = 'apps/dashboard/app/features/tenant/server/settings-actions.server.ts'
replace_once(
    actions,
    "  momoGatewaySettingsFormSchema,\n  sepayGatewaySettingsFormSchema,",
    "  momoGatewaySettingsFormSchema,\n  payosGatewaySettingsFormSchema,\n  sepayGatewaySettingsFormSchema,",
)
replace_once(
    actions,
    "  payoutPolicySchema,\n  updateGatewayPaymentSettingsInputSchema,",
    "  payoutPolicySchema,\n  customerPaymentMethodSchema,\n  paymentRoutingInputSchema,\n  updateTenantRefundPolicyInputSchema,",
)
replace_once(
    actions,
    "          accessKey?: unknown;\n          appId?: unknown;",
    "          accessKey?: unknown;\n          clientId?: unknown;\n          apiKey?: unknown;\n          checksumKey?: unknown;\n          appId?: unknown;",
)

p = Path(actions)
text = p.read_text()
marker = "      if (raw.gateway === 'zalopay') {"
if text.count(marker) != 1:
    raise SystemExit('zalopay insertion marker missing')
payos_branch = """      if (raw.gateway === 'payos') {
        const parsed = payosGatewaySettingsFormSchema.safeParse({
          environment: raw.environment,
          clientId: raw.credentials?.clientId,
          apiKey: raw.credentials?.apiKey,
          checksumKey: raw.credentials?.checksumKey,
        });
        if (!parsed.success) {
          return routeData(
            { form: 'payos', fieldErrors: parsed.error.flatten().fieldErrors },
            { status: 400 },
          );
        }
        const payload: UpsertGatewayConfigInput = {
          gateway: 'payos',
          environment: parsed.data.environment,
          credentials: {
            clientId: parsed.data.clientId,
            apiKey: parsed.data.apiKey,
            checksumKey: parsed.data.checksumKey,
          },
        };
        const res = await apiPut<GatewayConfigResponse>(apiPaths.tenant.gatewayConfig, payload, auth, {
          schema: gatewayConfigResponseSchema,
        });
        if (!res.ok) {
          return routeData(
            { form: 'payos', error: res.error ?? 'Không lưu được cấu hình PayOS.' },
            { status: res.status >= 400 && res.status <= 599 ? res.status : 400 },
          );
        }
        return { form: 'payos', ok: true };
      }

"""
p.write_text(text.replace(marker, payos_branch + marker, 1))

old_payment_settings = """  if (intent === 'payment-settings') {
    const parsed = updateGatewayPaymentSettingsInputSchema.safeParse({
      gateway: formData.get('gateway'),
      enabledMethods: formData.getAll('enabledMethods'),
      refundStrategy: formData.get('refundStrategy'),
      manualRefundSlaHours: Number(formData.get('manualRefundSlaHours')),
    });
    if (!parsed.success) {
      return routeData(
        { form: 'payment-settings', error: 'Hãy bật ít nhất một phương thức thanh toán.' },
        { status: 400 },
      );
    }
    const res = await apiPut(apiPaths.tenant.gatewayConfigSettings, parsed.data, auth);
    if (!res.ok) {
      return routeData(
        { form: 'payment-settings', error: res.error ?? 'Không lưu được cài đặt thanh toán.' },
        { status: 400 },
      );
    }
    return { form: 'payment-settings', ok: true };
  }

"""
new_payment_settings = """  if (intent === 'payment-routing') {
    const enabled = new Set(formData.getAll('enabledMethods').map(String));
    const routes = customerPaymentMethodSchema.options.flatMap((method) => {
      const gateway = String(formData.get(`gateway:${method}`) ?? '').trim();
      return gateway ? [{ method, gateway, enabled: enabled.has(method) }] : [];
    });
    const parsed = paymentRoutingInputSchema.safeParse({ routes });
    if (!parsed.success) {
      return routeData(
        { form: 'payment-routing', error: 'Định tuyến phương thức thanh toán không hợp lệ.' },
        { status: 400 },
      );
    }
    const res = await apiPut(apiPaths.tenant.paymentRouting, parsed.data, auth);
    if (!res.ok) {
      return routeData(
        { form: 'payment-routing', error: res.error ?? 'Không lưu được định tuyến thanh toán.' },
        { status: 400 },
      );
    }
    return { form: 'payment-routing', ok: true };
  }

  if (intent === 'refund-policy') {
    const parsed = updateTenantRefundPolicyInputSchema.safeParse({
      refundStrategy: formData.get('refundStrategy'),
      manualRefundSlaHours: Number(formData.get('manualRefundSlaHours')),
    });
    if (!parsed.success) {
      return routeData(
        { form: 'refund-policy', error: 'Chính sách hoàn tiền không hợp lệ.' },
        { status: 400 },
      );
    }
    const res = await apiPut(apiPaths.tenant.refundPolicy, parsed.data, auth);
    if (!res.ok) {
      return routeData(
        { form: 'refund-policy', error: res.error ?? 'Không lưu được chính sách hoàn tiền.' },
        { status: 400 },
      );
    }
    return { form: 'refund-policy', ok: true };
  }

"""
replace_once(actions, old_payment_settings, new_payment_settings)

# Route composition: separate providers, routing and refund policy.
route = 'apps/dashboard/app/routes/tenant/settings.tsx'
replace_once(
    route,
    "import { PaymentMethodSettingsCard } from '~/features/tenant/components/settings/payment-method-settings-card';",
    "import { CheckoutMethodSettingsCard } from '~/features/tenant/components/settings/checkout-method-settings-card';\nimport { RefundPolicyCard } from '~/features/tenant/components/settings/refund-policy-card';",
)
replace_once(
    route,
    "  sepay: 'payments',\n  momo: 'payments',",
    "  sepay: 'payments',\n  payos: 'payments',\n  momo: 'payments',",
)
replace_once(
    route,
    "  'gateway-off': 'payments',\n  'payment-settings': 'payments',",
    "  'gateway-off': 'payments',\n  'payment-routing': 'payments',\n  'refund-policy': 'payments',",
)
replace_once(
    route,
    "    gatewayConfigs,\n    gatewayError,\n    payoutPolicy,",
    "    gatewayConfigs,\n    gatewayError,\n    paymentRouting,\n    paymentRoutingError,\n    refundPolicy,\n    refundPolicyError,\n    payoutPolicy,",
)
replace_once(
    route,
    "  const baseGatewayConfig =\n    gatewayConfigs?.find((c) => c.gateway !== 'momo' && c.gateway !== 'zalopay') ?? null;\n",
    "",
)
replace_once(
    route,
    "              gatewayConfig={baseGatewayConfig}",
    "              gatewayConfig={gatewayConfigs?.[0] ?? null}",
)

p = Path(route)
text = p.read_text()
payments_anchor = '              value="payments"'
anchor = text.find(payments_anchor)
if anchor < 0:
    raise SystemExit('payments tab anchor missing')
start = text.find('              <PaymentGatewayCard', anchor)
end = text.find('            </TabsContent>', start)
if start < 0 or end < 0:
    raise SystemExit('payments block markers missing')
new_block = """              <PaymentGatewayCard
                configs={gatewayConfigs ?? []}
                readOnly={readOnly}
                sepay={{
                  saved: okFor('sepay'),
                  error: errFor('sepay'),
                  fieldErrors: fieldErrorsFor('sepay'),
                }}
                payos={{
                  saved: okFor('payos'),
                  error: errFor('payos'),
                  fieldErrors: fieldErrorsFor('payos'),
                }}
                momo={{
                  saved: okFor('momo'),
                  error: errFor('momo'),
                  fieldErrors: fieldErrorsFor('momo'),
                }}
                zalopay={{
                  saved: okFor('zalopay'),
                  error: errFor('zalopay'),
                  fieldErrors: fieldErrorsFor('zalopay'),
                }}
                offError={errFor('gateway-off') ?? gatewayError}
              />
              <CheckoutMethodSettingsCard
                routes={paymentRouting?.routes ?? []}
                configs={gatewayConfigs ?? []}
                readOnly={readOnly}
                error={errFor('payment-routing') ?? paymentRoutingError}
                success={okFor('payment-routing')}
              />
              <RefundPolicyCard
                policy={refundPolicy ?? { refundStrategy: 'manual', manualRefundSlaHours: 72 }}
                readOnly={readOnly}
                error={errFor('refund-policy') ?? refundPolicyError}
                success={okFor('refund-policy')}
              />
"""
p.write_text(text[:start] + new_block + text[end:])

# The combined routing/refund card has no callers after the route rewrite.
old_card = Path('apps/dashboard/app/features/tenant/components/settings/payment-method-settings-card.tsx')
if old_card.exists():
    old_card.unlink()

# One-shot helpers clean themselves from the implementation branch.
Path('scripts/agent-payment-routing-dashboard.py').unlink(missing_ok=True)
Path('.github/workflows/agent-payment-routing-dashboard.yml').unlink(missing_ok=True)
