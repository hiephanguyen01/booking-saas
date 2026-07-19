import type {
  Paginated,
  PaymentHistoryItem,
  RefundHistoryItem,
  RefundResponse,
} from '@booking/contracts';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiPaginatedResponse, UuidParam } from '../../../../shared/openapi/decorators';
import { toPaginated } from '../../../../shared/pagination/pagination';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import {
  toPaymentHistoryItem,
  toRefundHistoryItem,
  toRefundResponse,
} from '../../application/payments.mapper';
import { ListTenantPaymentsUseCase } from '../../application/use-cases/list-tenant-payments.use-case';
import { ConfirmManualRefundUseCase } from '../../application/use-cases/confirm-manual-refund.use-case';
import { ListTenantRefundsUseCase } from '../../application/use-cases/list-tenant-refunds.use-case';
import {
  ConfirmManualRefundDto,
  PaymentHistoryItemDto,
  PaymentHistoryQueryDto,
  RefundResponseDto,
  RefundHistoryItemDto,
  RefundHistoryQueryDto,
} from './dto/payments.dto';

@ApiTags('tenant-payments')
@Controller('tenant/payments')
export class TenantPaymentController {
  constructor(
    private readonly listPayments: ListTenantPaymentsUseCase,
    private readonly confirmManualRefund: ConfirmManualRefundUseCase,
    private readonly listRefunds: ListTenantRefundsUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('tenant.finance.read')
  @Get('refunds')
  @ApiOperation({ summary: 'List the tenant refund history' })
  @ApiPaginatedResponse(RefundHistoryItemDto)
  async refunds(@Query() query: RefundHistoryQueryDto): Promise<Paginated<RefundHistoryItem>> {
    return toPaginated(query, await this.listRefunds.execute(query), toRefundHistoryItem);
  }

  @RequirePermissions('tenant.finance.read')
  @Get()
  @ApiOperation({ summary: 'List the tenant payment transaction history' })
  @ApiPaginatedResponse(PaymentHistoryItemDto)
  async list(@Query() query: PaymentHistoryQueryDto): Promise<Paginated<PaymentHistoryItem>> {
    return toPaginated(query, await this.listPayments.execute(query), toPaymentHistoryItem);
  }

  @RequirePermissions('tenant.payouts.manage')
  @Post('refunds/:id/confirm')
  @UuidParam()
  @ApiOperation({ summary: 'Confirm a manual refund transfer' })
  @ApiCreatedResponse({ type: RefundResponseDto })
  async confirmRefund(
    @Param('id') id: string,
    @Body() input: ConfirmManualRefundDto,
  ): Promise<RefundResponse> {
    return toRefundResponse(
      await this.confirmManualRefund.execute(this.tenantContext.tenantIdOrThrow(), id, input),
    );
  }
}
