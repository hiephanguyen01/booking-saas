import {
  type GatewayConfigResponse
} from '@booking/contracts';
import { Body, Controller, Put, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import { UpsertGatewayConfigUseCase } from '../../application/use-cases/upsert-gateway-config.use-case';
import { toGatewayConfigResponse } from '../../application/payments.mapper';
import { GatewayConfigResponseDto, UpsertGatewayConfigDto } from './dto/payments.dto';

/** Tenant-side gateway credential management (§11.1). Scope via x-tenant-id. */
@ApiTags('tenant-gateway')
@Controller('tenant/gateway-config')
export class TenantGatewayController {
  constructor(
    private readonly upsert: UpsertGatewayConfigUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('tenant.settings.manage')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Put()
  @ApiOperation({ summary: 'Create or update the tenant payment gateway credentials' })
  @ApiOkResponse({ type: GatewayConfigResponseDto })
  async put(@Body() input: UpsertGatewayConfigDto): Promise<GatewayConfigResponse> {
    return toGatewayConfigResponse(
      await this.upsert.execute(this.tenantContext.tenantIdOrThrow(), input),
    );
  }
}
