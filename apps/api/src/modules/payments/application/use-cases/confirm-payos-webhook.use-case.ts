import { Inject, Injectable, Logger } from '@nestjs/common';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { GatewayOperationError } from '../../domain/errors/gateway-operation-error';
import {
  GATEWAY_CONFIG_REPOSITORY,
  type IGatewayConfigRepository,
} from '../../domain/ports/gateway-config-repository.port';
import {
  PAYOS_WEBHOOK_CONFIGURATOR,
  type PayosWebhookConfirmation,
  type PayosWebhookConfiguratorPort,
  type PayosWebhookCredentials,
} from '../../domain/ports/payos-webhook-configurator.port';
import {
  PayosWebhookConfirmationFailed,
  PayosWebhookConfirmationUnavailable,
  PayosWebhookNotConfigured,
} from '../payment-http-errors';

@Injectable()
export class ConfirmPayosWebhookUseCase {
  private readonly logger = new Logger(ConfirmPayosWebhookUseCase.name);

  constructor(
    @Inject(GATEWAY_CONFIG_REPOSITORY) private readonly configs: IGatewayConfigRepository,
    private readonly tenantContext: TenantContextService,
    private readonly tenantDb: TenantDbService,
    @Inject(PAYOS_WEBHOOK_CONFIGURATOR)
    private readonly configurator: PayosWebhookConfiguratorPort,
  ) {}

  async execute(): Promise<PayosWebhookConfirmation> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    const config = await this.tenantDb.forTenant(tenantId, (tx) =>
      this.configs.findActiveByGateway(tx, tenantId, 'payos'),
    );
    if (!config) throw new PayosWebhookNotConfigured();

    try {
      return await this.configurator.confirm(config.credentials as PayosWebhookCredentials);
    } catch (error) {
      this.logger.error(
        `PayOS confirmation error: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      if (error instanceof GatewayOperationError) {
        if (error.kind === 'retryable') throw new PayosWebhookConfirmationUnavailable();
        throw new PayosWebhookConfirmationFailed();
      }
      throw error;
    }
  }
}
