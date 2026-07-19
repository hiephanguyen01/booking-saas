import type { Paginated, SettlementDisputeResponse } from '@booking/contracts';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { ApiPaginatedResponse, UuidParam } from '../../../../shared/openapi/decorators';
import { toPaginated } from '../../../../shared/pagination/pagination';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { toSettlementDisputeResponse } from '../../application/finance.mapper';
import { ListSettlementDisputesUseCase } from '../../application/use-cases/list-settlement-disputes.use-case';
import { ResolveSettlementDisputeUseCase } from '../../application/use-cases/resolve-settlement-dispute.use-case';
import {
  TenantSettlementDisputesQueryDto,
  ResolveSettlementDisputeDto,
  SettlementDisputeResponseDto,
} from './dto/finance.dto';

@ApiTags('tenant-finance-disputes')
@Controller('tenant/finance/disputes')
export class TenantDisputeController {
  constructor(
    private readonly listDisputes: ListSettlementDisputesUseCase,
    private readonly resolveDispute: ResolveSettlementDisputeUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('tenant.disputes.read')
  @Get()
  @ApiOperation({ summary: 'List settlement disputes' })
  @ApiPaginatedResponse(SettlementDisputeResponseDto)
  async list(
    @Query() query: TenantSettlementDisputesQueryDto,
  ): Promise<Paginated<SettlementDisputeResponse>> {
    const result = await this.listDisputes.execute(this.tenantContext.tenantIdOrThrow(), query);
    return toPaginated(query, result, toSettlementDisputeResponse);
  }

  @RequirePermissions('tenant.disputes.resolve')
  @Post(':id/resolve')
  @UuidParam()
  @ApiOperation({ summary: 'Resolve a settlement dispute' })
  @ApiCreatedResponse({ type: SettlementDisputeResponseDto })
  async resolve(
    @Param('id') id: string,
    @Body() input: ResolveSettlementDisputeDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<SettlementDisputeResponse> {
    return toSettlementDisputeResponse(
      await this.resolveDispute.execute(
        this.tenantContext.tenantIdOrThrow(),
        id,
        input,
        principal.userId,
      ),
    );
  }
}
