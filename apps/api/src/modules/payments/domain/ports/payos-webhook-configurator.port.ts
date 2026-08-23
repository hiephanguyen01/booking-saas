export const PAYOS_WEBHOOK_CONFIGURATOR = Symbol('PAYOS_WEBHOOK_CONFIGURATOR');

export interface PayosWebhookCredentials {
  clientId: string;
  apiKey: string;
  checksumKey: string;
}

export interface PayosWebhookConfirmation {
  verified: true;
  webhookUrl: string;
}

export interface PayosWebhookConfiguratorPort {
  confirm(credentials: PayosWebhookCredentials): Promise<PayosWebhookConfirmation>;
}
