import { Injectable, Logger } from '@nestjs/common';
import { GatewayOperationError } from '../../domain/errors/gateway-operation-error';
import type {
  PayosWebhookConfirmation,
  PayosWebhookConfiguratorPort,
  PayosWebhookCredentials,
} from '../../domain/ports/payos-webhook-configurator.port';
import { providerJson } from './provider-http';

const PAYOS_API_BASE = 'https://api-merchant.payos.vn';
const PROVIDER_TIMEOUT_MS = 30_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveWebhookUrl(): string {
  const configured = process.env.PUBLIC_API_URL;
  if (!configured) {
    throw new GatewayOperationError('configuration', 'PUBLIC_API_URL is required for PayOS webhook setup');
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch (cause) {
    throw new GatewayOperationError('configuration', 'PUBLIC_API_URL is invalid', { cause });
  }

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  ) {
    throw new GatewayOperationError(
      'configuration',
      'PUBLIC_API_URL must be a public HTTPS origin for PayOS webhook setup',
    );
  }

  return `${url.origin}/webhooks/payos`;
}

function parseConfirmation(value: unknown): PayosWebhookConfirmation {
  if (!isRecord(value)) {
    throw new GatewayOperationError('retryable', 'payOS returned an invalid response');
  }

  if (value.code === '214' || value.code === '401' || value.code === '403') {
    throw new GatewayOperationError('configuration', 'payOS channel is unavailable');
  }
  if (value.code !== '00') {
    throw new GatewayOperationError('final', 'payOS rejected webhook confirmation');
  }
  if (!isRecord(value.data) || typeof value.data.webhookUrl !== 'string') {
    throw new GatewayOperationError('retryable', 'payOS returned an invalid response');
  }

  return { verified: true, webhookUrl: value.data.webhookUrl };
}

@Injectable()
export class PayosWebhookConfigurator implements PayosWebhookConfiguratorPort {
  private readonly logger = new Logger(PayosWebhookConfigurator.name);

  async confirm(credentials: PayosWebhookCredentials): Promise<PayosWebhookConfirmation> {
    const webhookUrl = resolveWebhookUrl();
    this.logger.log(`Confirming PayOS webhook with URL: ${webhookUrl}`);
    return providerJson({
      url: `${PAYOS_API_BASE}/confirm-webhook`,
      timeoutMs: PROVIDER_TIMEOUT_MS,
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-client-id': credentials.clientId,
          'x-api-key': credentials.apiKey,
        },
        body: JSON.stringify({ webhookUrl }),
      },
      parse: parseConfirmation,
    });
  }
}
