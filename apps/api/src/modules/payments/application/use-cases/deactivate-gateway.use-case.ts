import { Inject, Injectable } from '@nestjs/common';
import type { GatewayKey } from '@booking/contracts';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  GATEWAY_CONFIG_REPOSITORY,
  type IGatewayConfigRepository,
} from '../../domain/ports/gateway-config-repository.port';

/**
 * Turn off a tenant payment gateway ("Tắt", §11.1) — checkout then rejects for that
 * gateway. With no `gateway`, turns off every active gateway (base + wallets).
 */
@Injectable()
export class DeactivateGatewayUseCase {
  constructor(
    @Inject(GATEWAY_CONFIG_REPOSITORY) private readonly configs: IGatewayConfigRepository,
    private readonly tenantContext: TenantContextService,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(gateway?: GatewayKey): Promise<void> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    return this.tenantDb.forTenant(tenantId, (tx) =>
      this.configs.deactivate(tx, tenantId, gateway),
    );
  }
}
