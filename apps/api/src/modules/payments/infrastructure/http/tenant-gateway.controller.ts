import { Body, Controller, Put, UseGuards } from '@nestjs/common';
import {
  upsertGatewayConfigInputSchema,
  type GatewayConfigResponse,
  type UpsertGatewayConfigInput,
} from '@booking/contracts';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import { UpsertGatewayConfigUseCase } from '../../application/use-cases/upsert-gateway-config.use-case';

/** Tenant-side gateway credential management (§11.1). Scope via x-tenant-id. */
@Controller('tenant/gateway-config')
export class TenantGatewayController {
  constructor(
    private readonly upsert: UpsertGatewayConfigUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('tenant.settings.manage')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Put()
  async put(
    @Body(new ZodValidationPipe(upsertGatewayConfigInputSchema)) input: UpsertGatewayConfigInput,
  ): Promise<GatewayConfigResponse> {
    const config = await this.upsert.execute(this.tenantContext.tenantIdOrThrow(), input);
    return { gateway: config.gateway, environment: config.environment, isActive: true };
  }
}
