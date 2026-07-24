import { Inject, Injectable } from '@nestjs/common';
import {
  momoGatewayConfigInputSchema,
  sepayGatewayConfigInputSchema,
  zalopayGatewayConfigInputSchema,
  type UpsertGatewayConfigInput,
} from '@booking/contracts';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  GATEWAY_CONFIG_REPOSITORY,
  type GatewayConfigRecord,
  type IGatewayConfigRepository,
} from '../../domain/ports/gateway-config-repository.port';
import { InvalidGatewayConfig } from '../payment-http-errors';

/** Tenant admin stores gateway credentials (encrypted at rest, §11.1). */
@Injectable()
export class UpsertGatewayConfigUseCase {
  constructor(
    @Inject(GATEWAY_CONFIG_REPOSITORY) private readonly configs: IGatewayConfigRepository,
    private readonly tenantContext: TenantContextService,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(input: UpsertGatewayConfigInput): Promise<GatewayConfigRecord> {
    const validated =
      input.gateway === 'sepay'
        ? sepayGatewayConfigInputSchema.safeParse(input)
        : input.gateway === 'momo'
          ? momoGatewayConfigInputSchema.safeParse(input)
          : input.gateway === 'zalopay'
            ? zalopayGatewayConfigInputSchema.safeParse(input)
            : { success: true as const, data: input };
    if (!validated.success) {
      throw new InvalidGatewayConfig(validated.error.flatten());
    }
    const tenantId = this.tenantContext.tenantIdOrThrow();
    return this.tenantDb.forTenant(tenantId, (tx) =>
      this.configs.upsert(tx, tenantId, {
        gateway: validated.data.gateway,
        environment: validated.data.environment,
        credentials: validated.data.credentials,
        settings: 'settings' in validated.data ? validated.data.settings : undefined,
      }),
    );
  }
}
