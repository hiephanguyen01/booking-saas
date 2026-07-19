import type {
  BookingSettlementResponse,
  Paginated,
  PlatformFinanceResponse,
  AdminSettlementDisputeResponse,
} from '@booking/contracts';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { ApiPaginatedResponse } from '../../../../shared/openapi/decorators';
import { toPaginated } from '../../../../shared/pagination/pagination';
import {
  toBookingSettlementResponse,
  toPlatformFinanceResponse,
  toAdminSettlementDisputeResponse,
} from '../../application/finance.mapper';
import { GetPlatformFinanceUseCase } from '../../application/use-cases/get-platform-finance.use-case';
import { ListPlatformSettlementsUseCase } from '../../application/use-cases/list-platform-settlements.use-case';
import { ListPlatformDisputesUseCase } from '../../application/use-cases/list-platform-disputes.use-case';
import {
  BookingSettlementResponseDto,
  BookingSettlementsQueryDto,
  PlatformFinanceResponseDto,
  AdminSettlementDisputeResponseDto,
  AdminSettlementDisputesQueryDto,
} from './dto/finance.dto';

/** Platform-admin finance (§13.3): platform fee collected per tenant (admin pool). */
@ApiTags('platform-finance')
@Controller('platform/finance')
export class PlatformFinanceController {
  constructor(
    private readonly platformFinanceUseCase: GetPlatformFinanceUseCase,
    private readonly listSettlements: ListPlatformSettlementsUseCase,
    private readonly listDisputes: ListPlatformDisputesUseCase,
  ) {}

  @RequirePermissions('platform.finance.read')
  @Get()
  @ApiOperation({ summary: 'Platform fee collected per tenant' })
  @ApiOkResponse({ type: PlatformFinanceResponseDto })
  async finance(): Promise<PlatformFinanceResponse> {
    return toPlatformFinanceResponse(await this.platformFinanceUseCase.execute());
  }

  @RequirePermissions('platform.finance.read')
  @Get('settlements')
  @ApiOperation({ summary: 'Platform settlement register across tenants' })
  @ApiPaginatedResponse(BookingSettlementResponseDto)
  async settlements(
    @Query() query: BookingSettlementsQueryDto,
  ): Promise<Paginated<BookingSettlementResponse>> {
    return toPaginated(
      query,
      await this.listSettlements.execute(query),
      toBookingSettlementResponse,
    );
  }

  @RequirePermissions('platform.disputes.read')
  @Get('disputes')
  @ApiOperation({ summary: 'Platform dispute register across tenants' })
  @ApiPaginatedResponse(AdminSettlementDisputeResponseDto)
  async disputes(
    @Query() query: AdminSettlementDisputesQueryDto,
  ): Promise<Paginated<AdminSettlementDisputeResponse>> {
    return toPaginated(
      query,
      await this.listDisputes.execute(query),
      toAdminSettlementDisputeResponse,
    );
  }
}
