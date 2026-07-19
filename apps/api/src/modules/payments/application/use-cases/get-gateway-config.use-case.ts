import { Inject, Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  GATEWAY_CONFIG_REPOSITORY,
  type GatewayConfigRecord,
  type IGatewayConfigRepository,
} from '../../domain/ports/gateway-config-repository.port';

/** Read the active tenant gateway without exposing its encrypted secret. */
@Injectable()
export class GetGatewayConfigUseCase {
  constructor(
    @Inject(GATEWAY_CONFIG_REPOSITORY) private readonly configs: IGatewayConfigRepository,
    private readonly tenantContext: TenantContextService,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(): Promise<GatewayConfigRecord | null> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    return this.tenantDb.forTenant(tenantId, (tx) => this.configs.findActive(tx, tenantId));
  }
}
