import { Inject, Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  GATEWAY_CONFIG_REPOSITORY,
  type IGatewayConfigRepository,
} from '../../domain/ports/gateway-config-repository.port';
import {
  PAYOS_WEBHOOK_CONFIGURATOR,
  type PayosWebhookConfirmation,
  type PayosWebhookConfiguratorPort,
} from '../../domain/ports/payos-webhook-configurator.port';

@Injectable()
export class ConfirmPayosWebhookUseCase {
  constructor(
    @Inject(GATEWAY_CONFIG_REPOSITORY) private readonly configs: IGatewayConfigRepository,
    private readonly tenantContext: TenantContextService,
    private readonly tenantDb: TenantDbService,
    @Inject(PAYOS_WEBHOOK_CONFIGURATOR)
    private readonly configurator: PayosWebhookConfiguratorPort,
  ) {}

  async execute(): Promise<PayosWebhookConfirmation> {
    void this.configs;
    void this.tenantContext;
    void this.tenantDb;
    void this.configurator;
    throw new Error('Not implemented');
  }
}
