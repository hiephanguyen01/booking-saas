from pathlib import Path

# Persist/read the two additive Payment snapshot columns.
repo = Path('apps/api/src/modules/payments/infrastructure/repositories/prisma-payment.repository.ts')
text = repo.read_text()
text = text.replace(
    '    gatewayConfigRevisionId: p.gatewayConfigRevisionId,\n    gatewayOrderRef: p.gatewayOrderRef,',
    "    gatewayConfigRevisionId: p.gatewayConfigRevisionId,\n"
    "    refundStrategySnapshot: p.refundStrategySnapshot as PaymentRecord['refundStrategySnapshot'],\n"
    "    manualRefundSlaHoursSnapshot: p.manualRefundSlaHoursSnapshot,\n"
    '    gatewayOrderRef: p.gatewayOrderRef,',
)
text = text.replace(
    '          gatewayConfigRevisionId: data.gatewayConfigRevisionId,\n          gatewayOrderRef: data.gatewayOrderRef,',
    '          gatewayConfigRevisionId: data.gatewayConfigRevisionId,\n'
    '          refundStrategySnapshot: data.refundStrategySnapshot,\n'
    '          manualRefundSlaHoursSnapshot: data.manualRefundSlaHoursSnapshot,\n'
    '          gatewayOrderRef: data.gatewayOrderRef,',
)
repo.write_text(text)

# Migrate the existing Checkout use-case harness to the new seams.
spec = Path('apps/api/src/modules/payments/application/use-cases/checkout.use-case.spec.ts')
text = spec.read_text()
text = text.replace(
    "import type {\n  GatewayConfigRecord,\n  IGatewayConfigRepository,\n} from '../../domain/ports/gateway-config-repository.port';",
    "import type { GatewayConfigRecord } from '../../domain/ports/gateway-config-repository.port';",
)
needle = "import type {\n  CreatePendingCheckoutData,\n  IPaymentRepository,\n  PaymentRecord,\n} from '../../domain/ports/payment-repository.port';"
replacement = needle + "\nimport type { IRefundPolicyRepository } from '../../domain/ports/refund-policy-repository.port';"
text = text.replace(needle, replacement)
text = text.replace(
    '    gatewayConfigRevisionId: data.gatewayConfigRevisionId,\n    gatewayOrderRef: data.gatewayOrderRef ?? null,',
    '    gatewayConfigRevisionId: data.gatewayConfigRevisionId,\n'
    '    refundStrategySnapshot: data.refundStrategySnapshot,\n'
    '    manualRefundSlaHoursSnapshot: data.manualRefundSlaHoursSnapshot,\n'
    '    gatewayOrderRef: data.gatewayOrderRef ?? null,',
)
text = text.replace(
    "          gatewayConfigRevisionId: `config-${key}`,\n          gatewayOrderRef: options.pending.id,",
    "          gatewayConfigRevisionId: `config-${key}`,\n"
    "          refundStrategySnapshot: 'manual',\n"
    "          manualRefundSlaHoursSnapshot: 72,\n"
    '          gatewayOrderRef: options.pending.id,',
)
old_registry = '''    fakePort<GatewayRegistryPort>({
      resolveActiveForCheckout: (_tx, _tenantId, requested) => {
        routedTo.push(requested);
        return Promise.resolve({
          gateway,
          configRevisionId: requested ? `config-${requested}` : null,
          settings: {
            enabledMethods: [],
            refundStrategy: 'manual',
            manualRefundSlaHours: 72,
          } as GatewayPaymentSettings,
        });
      },
      resolveForPayment: (_tx, payment) =>
        Promise.resolve({
          gateway,
          configRevisionId: payment.gatewayConfigRevisionId,
          settings: {
            enabledMethods: [],
            refundStrategy: 'manual',
            manualRefundSlaHours: 72,
          } as GatewayPaymentSettings,
        }),
    }),
    fakePort<IGatewayConfigRepository>({
      findActiveAll: () =>
        Promise.resolve(options.configs ?? [config('sepay', ['bank_transfer', 'napas_qr'])]),
    }),'''
new_registry = '''    fakePort<GatewayRegistryPort>({
      resolveActiveForMethod: (_tx, _tenantId, method) => {
        const configured = options.configs ?? [config('sepay', ['bank_transfer', 'napas_qr'])];
        if (configured.length === 0) {
          routedTo.push(undefined);
          return Promise.resolve({
            gateway,
            configRevisionId: null,
            settings: {
              enabledMethods: [],
              refundStrategy: 'manual',
              manualRefundSlaHours: 72,
            } as GatewayPaymentSettings,
          });
        }
        const selected = configured.find(
          (candidate) =>
            candidate.gateway === key && candidate.settings.enabledMethods.includes(method),
        );
        if (!selected) return Promise.reject(new PaymentMethodUnavailable());
        routedTo.push(selected.gateway);
        return Promise.resolve({
          gateway,
          configRevisionId: selected.gateway === 'mock' ? null : selected.id,
          settings: selected.settings,
        });
      },
      resolveForPayment: (_tx, payment) =>
        Promise.resolve({
          gateway,
          configRevisionId: payment.gatewayConfigRevisionId,
          settings: {
            enabledMethods: [],
            refundStrategy: 'manual',
            manualRefundSlaHours: 72,
          } as GatewayPaymentSettings,
        }),
    }),
    fakePort<IRefundPolicyRepository>({
      get: () => Promise.resolve({ refundStrategy: 'manual', manualRefundSlaHours: 72 }),
    }),'''
if old_registry not in text:
    raise SystemExit('legacy checkout registry harness block not found')
text = text.replace(old_registry, new_registry)
spec.write_text(text)
