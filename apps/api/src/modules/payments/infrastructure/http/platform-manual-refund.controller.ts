import { Body, Controller, HttpCode, Ip, Param, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ManualRefundWorkflowEnableResponse } from '@booking/contracts';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { UuidParam } from '../../../../shared/openapi/decorators';
import { BreakGlassCompleteManualRefundUseCase } from '../../application/use-cases/break-glass-complete-manual-refund.use-case';
import { EnableManualRefundWorkflowUseCase } from '../../application/use-cases/enable-manual-refund-workflow.use-case';
import {
  ManualRefundBreakGlassDto,
  ManualRefundWorkflowEnableResponseDto,
} from './dto/payments.dto';

@ApiTags('platform-manual-refunds')
@Controller('platform/tenants/:tenantId/refunds')
export class PlatformManualRefundController {
  constructor(
    private readonly breakGlass: BreakGlassCompleteManualRefundUseCase,
    private readonly enableWorkflow: EnableManualRefundWorkflowUseCase,
  ) {}

  @RequirePermissions('platform.tenants.write')
  @Post('enable-workflow')
  @HttpCode(200)
  @UuidParam('tenantId')
  @ApiOperation({ summary: 'Enable manual refund V2 and backfill legacy manual batches' })
  @ApiOkResponse({ type: ManualRefundWorkflowEnableResponseDto })
  async enable(
    @Param('tenantId') tenantId: string,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<ManualRefundWorkflowEnableResponse> {
    return this.enableWorkflow.execute(tenantId, principal.userId);
  }

  @RequirePermissions('platform.refunds.break_glass')
  @Post(':id/break-glass')
  @HttpCode(200)
  @UuidParam('tenantId')
  @UuidParam('id')
  @ApiOperation({ summary: 'Emergency approval of a submitted manual refund transfer' })
  async completeWithBreakGlass(
    @Param('tenantId') tenantId: string,
    @Param('id') operationId: string,
    @Body() input: ManualRefundBreakGlassDto,
    @CurrentPrincipal() principal: SessionPrincipal,
    @Ip() ip: string,
  ) {
    return this.breakGlass.execute(tenantId, operationId, input, {
      userId: principal.userId,
      sessionId: principal.sessionId,
      ip,
    });
  }
}
