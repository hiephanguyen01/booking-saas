import type {
  CustomerBookingSettlementResponse,
  SettlementDisputeResponse,
} from '@booking/contracts';
import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UuidParam } from '../../../../shared/openapi/decorators';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { AuthenticatedOnly } from '../../../identity-access/infrastructure/http/decorators/authenticated-only.decorator';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import {
  toCustomerBookingSettlementResponse,
  toSettlementDisputeResponse,
} from '../../application/finance.mapper';
import { GetCustomerBookingSettlementUseCase } from '../../application/use-cases/get-customer-booking-settlement.use-case';
import { OpenSettlementDisputeUseCase } from '../../application/use-cases/open-settlement-dispute.use-case';
import {
  OpenSettlementDisputeDto,
  CustomerBookingSettlementResponseDto,
  SettlementDisputeResponseDto,
} from './dto/finance.dto';

@ApiTags('customer-finance')
@Controller('customer/finance')
export class CustomerFinanceController {
  constructor(
    private readonly openDispute: OpenSettlementDisputeUseCase,
    private readonly getSettlement: GetCustomerBookingSettlementUseCase,
  ) {}

  @AuthenticatedOnly()
  @Get('settlements/:bookingId')
  @UuidParam('bookingId')
  @ApiOperation({ summary: 'Get the settlement state for an owned booking' })
  @ApiOkResponse({ type: CustomerBookingSettlementResponseDto })
  async settlement(
    @Headers('x-forwarded-host') forwardedHost: string | undefined,
    @Headers('host') host: string | undefined,
    @CurrentPrincipal() principal: SessionPrincipal,
    @Param('bookingId') bookingId: string,
  ): Promise<CustomerBookingSettlementResponse> {
    return toCustomerBookingSettlementResponse(
      await this.getSettlement.execute(
        forwardedHost ?? host ?? '',
        principal.userId,
        bookingId,
      ),
    );
  }

  @AuthenticatedOnly()
  @Post('disputes')
  @ApiOperation({ summary: 'Open a settlement dispute for an owned booking' })
  @ApiCreatedResponse({ type: SettlementDisputeResponseDto })
  async dispute(
    @Headers('x-forwarded-host') forwardedHost: string | undefined,
    @Headers('host') host: string | undefined,
    @CurrentPrincipal() principal: SessionPrincipal,
    @Body() input: OpenSettlementDisputeDto,
  ): Promise<SettlementDisputeResponse> {
    return toSettlementDisputeResponse(
      await this.openDispute.execute(forwardedHost ?? host ?? '', principal.userId, input),
    );
  }
}
