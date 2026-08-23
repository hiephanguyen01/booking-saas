import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const payosCardPath = resolve(
  process.cwd(),
  'apps/dashboard/app/features/tenant/components/settings/payos-gateway-card.tsx',
);
const validationPipePath = resolve(
  process.cwd(),
  'apps/api/src/modules/payments/infrastructure/http/gateway-config-validation.pipe.ts',
);
const controllerPath = resolve(
  process.cwd(),
  'apps/api/src/modules/payments/infrastructure/http/tenant-gateway.controller.ts',
);
const modulePath = resolve(
  process.cwd(),
  'apps/api/src/modules/payments/infrastructure/http/payments.module.ts',
);
const actionsPath = resolve(
  process.cwd(),
  'apps/dashboard/app/features/tenant/server/settings-actions.server.ts',
);
const apiPathsPath = resolve(process.cwd(), 'apps/dashboard/app/constants/api-paths.ts');

describe('PayOS production readiness architecture', () => {
  it('treats PayOS as production-only without exposing a sandbox setting', () => {
    const validationPipe = readFileSync(validationPipePath, 'utf8');
    const card = readFileSync(payosCardPath, 'utf8');

    expect(validationPipe).toContain(
      "parsed.data.gateway === 'payos' && parsed.data.environment !== 'production'",
    );
    expect(card).not.toContain("name: 'environment'");
    expect(card).not.toContain('Sandbox');
    expect(card).toContain("environment: 'production'");
  });

  it('exposes a tenant action that confirms the active PayOS webhook with the provider', () => {
    const controller = readFileSync(controllerPath, 'utf8');
    const moduleSource = readFileSync(modulePath, 'utf8');

    expect(controller).toContain("@Post('payos/confirm-webhook')");
    expect(controller).toContain('ConfirmPayosWebhookUseCase');
    expect(moduleSource).toContain('PAYOS_WEBHOOK_CONFIGURATOR');
    expect(moduleSource).toContain('PayosWebhookConfigurator');
    expect(moduleSource).toContain('ConfirmPayosWebhookUseCase');
  });

  it('wires dashboard confirmation and renders a verified PayOS webhook result', () => {
    const actions = readFileSync(actionsPath, 'utf8');
    const apiPaths = readFileSync(apiPathsPath, 'utf8');
    const card = readFileSync(payosCardPath, 'utf8');

    expect(actions).toContain("intent === 'confirm-payos-webhook'");
    expect(apiPaths).toContain('payosConfirmWebhook');
    expect(card).toContain('confirm-payos-webhook');
    expect(card).toContain('Webhook đã được PayOS xác nhận');
  });
});
