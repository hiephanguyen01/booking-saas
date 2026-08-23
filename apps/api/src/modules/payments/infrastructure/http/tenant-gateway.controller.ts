import {
  gatewayKeySchema,
  type GatewayConfigResponse,
  type GatewayKey,
  type UpsertGatewayConfigInput,
} from '@booking/contracts';
import { Body, Controller, Delete, Get, HttpCode, Put, Query, UseGuards } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { GatewayConfigValidationPipe } from './gateway-config-validation.pipe';
import { UpsertGatewayConfigUseCase } from '../../application/use-cases/upsert-gateway-config.use-case';
import { GetGatewayConfigUseCase } from '../../application/use-cases/get-gateway-config.use-case';
import { DeactivateGatewayUseCase } from '../../application/use-cases/deactivate-gateway.use-case';
import { toGatewayConfigResponse } from '../../application/payments.mapper';
import { GatewayConfigResponseDto } from './dto/payments.dto';

/** Tenant-side provider credential management. Routing and refund policy are separate resources. */
@ApiTags('tenant-gateway')
@Controller('tenant/gateway-config')
export class TenantGatewayController {
  constructor(
    private readonly getConfig: GetGatewayConfigUseCase,
    private readonly upsert: UpsertGatewayConfigUseCase,
    private readonly deactivate: DeactivateGatewayUseCase,
  ) {}

  @RequirePermissions('tenant.settings.manage')
  @Get()
  @ApiOperation({ summary: 'Get the tenant active payment gateway configurations' })
  @ApiOkResponse({ type: GatewayConfigResponseDto, isArray: true })
  async get(): Promise<GatewayConfigResponse[]> {
    return (await this.getConfig.execute()).map(toGatewayConfigResponse);
  }

  @RequirePermissions('tenant.settings.manage')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Put()
  @ApiOperation({ summary: 'Create or update one tenant payment provider credential revision' })
  @ApiOkResponse({ type: GatewayConfigResponseDto })
  async put(
    @Body(new GatewayConfigValidationPipe())
    input: UpsertGatewayConfigInput,
  ): Promise<GatewayConfigResponse> {
    return toGatewayConfigResponse(await this.upsert.execute(input));
  }

  @RequirePermissions('tenant.settings.manage')
  @Delete()
  @HttpCode(204)
  @ApiOperation({
    summary: 'Disable one tenant payment provider, or every provider when none is given',
  })
  @ApiNoContentResponse()
  async remove(
    @Query('gateway', new ZodValidationPipe(gatewayKeySchema.optional())) gateway?: GatewayKey,
  ): Promise<void> {
    await this.deactivate.execute(gateway);
  }
}
