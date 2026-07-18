import type { Paginated, PaymentHistoryItem } from '@booking/contracts';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiPaginatedResponse } from '../../../../shared/openapi/decorators';
import { toPaginated } from '../../../../shared/pagination/pagination';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { toPaymentHistoryItem } from '../../application/payments.mapper';
import { ListPlatformPaymentsUseCase } from '../../application/use-cases/list-platform-payments.use-case';
import { PaymentHistoryItemDto, PaymentHistoryQueryDto } from './dto/payments.dto';

@ApiTags('platform-payments')
@Controller('platform/payments')
export class PlatformPaymentController {
  constructor(private readonly listPayments: ListPlatformPaymentsUseCase) {}

  @RequirePermissions('platform.finance.read')
  @Get()
  @ApiOperation({ summary: 'List payment transactions across tenants' })
  @ApiPaginatedResponse(PaymentHistoryItemDto)
  async list(@Query() query: PaymentHistoryQueryDto): Promise<Paginated<PaymentHistoryItem>> {
    return toPaginated(query, await this.listPayments.execute(query), toPaymentHistoryItem);
  }
}
