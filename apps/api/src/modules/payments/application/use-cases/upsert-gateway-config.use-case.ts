import { Inject, Injectable } from '@nestjs/common';
import type { UpsertGatewayConfigInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  GATEWAY_CONFIG_REPOSITORY,
  type GatewayConfigRecord,
  type IGatewayConfigRepository,
} from '../../domain/ports/gateway-config-repository.port';

/** Tenant admin stores gateway credentials (encrypted at rest, §11.1). */
@Injectable()
export class UpsertGatewayConfigUseCase {
  constructor(
    @Inject(GATEWAY_CONFIG_REPOSITORY) private readonly configs: IGatewayConfigRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, input: UpsertGatewayConfigInput): Promise<GatewayConfigRecord> {
    return this.tenantDb.forTenant(tenantId, (tx) =>
      this.configs.upsert(tx, tenantId, {
        gateway: input.gateway,
        environment: input.environment,
        credentials: input.credentials,
      }),
    );
  }
}
