import { uuidSchema } from '@booking/contracts';
import type {
  BookingSettlementResponse,
  CommissionRuleResponse,
  Paginated,
  PlatformFinanceResponse,
  AdminSettlementDisputeResponse,
} from '@booking/contracts';
import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { ApiPaginatedResponse, UuidParam } from '../../../../shared/openapi/decorators';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { toPaginated } from '../../../../shared/pagination/pagination';
import {
  toBookingSettlementResponse,
  toCommissionRuleResponse,
  toPlatformFinanceResponse,
  toAdminSettlementDisputeResponse,
} from '../../application/finance.mapper';
import { GetPlatformFinanceUseCase } from '../../application/use-cases/get-platform-finance.use-case';
import { ListPlatformSettlementsUseCase } from '../../application/use-cases/list-platform-settlements.use-case';
import { ListPlatformDisputesUseCase } from '../../application/use-cases/list-platform-disputes.use-case';
import { ListCommissionRulesUseCase } from '../../application/use-cases/list-commission-rules.use-case';
import { UpdateTenantPlatformRateUseCase } from '../../application/use-cases/update-tenant-platform-rate.use-case';
import {
  BookingSettlementResponseDto,
  BookingSettlementsQueryDto,
  CommissionRuleResponseDto,
  PlatformFinanceResponseDto,
  UpdatePlatformRateDto,
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
    private readonly listRules: ListCommissionRulesUseCase,
    private readonly updatePlatformRate: UpdateTenantPlatformRateUseCase,
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

  /**
   * Lives here rather than on the tenant-detail response because `finance`
   * already imports `TenancyModule` — having tenancy read commission rules back
   * would close a module cycle that `check:module-cycles` rejects.
   */
  @RequirePermissions('platform.finance.read')
  @Get('tenants/:tenantId/commission-rules')
  @ApiOperation({ summary: "A tenant's commission rules, for the platform admin" })
  @UuidParam('tenantId')
  @ApiOkResponse({ type: [CommissionRuleResponseDto] })
  async tenantRules(
    @Param('tenantId', new ZodValidationPipe(uuidSchema)) tenantId: string,
  ): Promise<CommissionRuleResponse[]> {
    return (await this.listRules.execute(tenantId)).map(toCommissionRuleResponse);
  }

  /**
   * Applies to EVERY commission rule of the tenant — an override carries its own
   * copy of the rate, so updating only `tenant_default` would keep billing
   * overridden partners the old fee. Rejected wholesale if any rule cannot carry
   * the new rate. Existing bookings are unaffected (frozen snapshot, §13.1).
   */
  @RequirePermissions('platform.finance.manage')
  @Patch('tenants/:tenantId/platform-rate')
  @ApiOperation({ summary: "Set a tenant's platform fee % across all its commission rules" })
  @UuidParam('tenantId')
  @ApiOkResponse({ type: [CommissionRuleResponseDto] })
  async setPlatformRate(
    @Param('tenantId', new ZodValidationPipe(uuidSchema)) tenantId: string,
    @Body() input: UpdatePlatformRateDto,
  ): Promise<CommissionRuleResponse[]> {
    return (await this.updatePlatformRate.execute(tenantId, input)).map(toCommissionRuleResponse);
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
