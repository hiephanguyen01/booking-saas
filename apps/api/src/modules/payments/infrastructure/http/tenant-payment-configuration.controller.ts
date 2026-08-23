import type {
  PaymentRoutingInput,
  PaymentRoutingResponse,
  TenantRefundPolicy,
  UpdateTenantRefundPolicyInput,
} from '@booking/contracts';
import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import { GetPaymentRoutingUseCase } from '../../application/use-cases/get-payment-routing.use-case';
import { UpdatePaymentRoutingUseCase } from '../../application/use-cases/update-payment-routing.use-case';
import { GetRefundPolicyUseCase } from '../../application/use-cases/get-refund-policy.use-case';
import { UpdateRefundPolicyUseCase } from '../../application/use-cases/update-refund-policy.use-case';
import {
  PaymentRoutingInputDto,
  PaymentRoutingResponseDto,
  TenantRefundPolicyDto,
  UpdateTenantRefundPolicyDto,
} from './dto/payments.dto';

@ApiTags('tenant-payment-configuration')
@Controller('tenant')
export class TenantPaymentConfigurationController {
  constructor(
    private readonly getRouting: GetPaymentRoutingUseCase,
    private readonly updateRouting: UpdatePaymentRoutingUseCase,
    private readonly getRefundPolicy: GetRefundPolicyUseCase,
    private readonly updateRefundPolicy: UpdateRefundPolicyUseCase,
  ) {}

  @RequirePermissions('tenant.settings.manage')
  @Get('payment-routing')
  @ApiOperation({ summary: 'Get explicit tenant checkout method routing' })
  @ApiOkResponse({ type: PaymentRoutingResponseDto })
  getPaymentRouting(): Promise<PaymentRoutingResponse> {
    return this.getRouting.execute();
  }

  @RequirePermissions('tenant.settings.manage')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Put('payment-routing')
  @ApiOperation({ summary: 'Replace explicit tenant checkout method routing' })
  @ApiOkResponse({ type: PaymentRoutingResponseDto })
  putPaymentRouting(@Body() input: PaymentRoutingInputDto): Promise<PaymentRoutingResponse> {
    return this.updateRouting.execute(input as PaymentRoutingInput);
  }

  @RequirePermissions('tenant.settings.manage')
  @Get('refund-policy')
  @ApiOperation({ summary: 'Get tenant refund policy for future payments' })
  @ApiOkResponse({ type: TenantRefundPolicyDto })
  getTenantRefundPolicy(): Promise<TenantRefundPolicy> {
    return this.getRefundPolicy.execute();
  }

  @RequirePermissions('tenant.settings.manage')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Put('refund-policy')
  @ApiOperation({ summary: 'Update tenant refund policy for future payments' })
  @ApiOkResponse({ type: TenantRefundPolicyDto })
  putTenantRefundPolicy(
    @Body() input: UpdateTenantRefundPolicyDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<TenantRefundPolicy> {
    return this.updateRefundPolicy.execute(input as UpdateTenantRefundPolicyInput, principal.userId);
  }
}
