import { Body, Controller, Get, Header, HttpCode, Ip, Param, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  ManualRefundReadinessResponse,
  ManualRefundWorkflowControlInput,
  ManualRefundWorkflowEnableResponse,
  ManualRefundWorkflowState,
} from '@booking/contracts';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { UuidParam } from '../../../../shared/openapi/decorators';
import { BreakGlassCompleteManualRefundUseCase } from '../../application/use-cases/break-glass-complete-manual-refund.use-case';
import { EnableManualRefundWorkflowUseCase } from '../../application/use-cases/enable-manual-refund-workflow.use-case';
import { GetManualRefundReadinessUseCase } from '../../application/use-cases/get-manual-refund-readiness.use-case';
import { PauseManualRefundWorkflowUseCase } from '../../application/use-cases/pause-manual-refund-workflow.use-case';
import { ResumeManualRefundWorkflowUseCase } from '../../application/use-cases/resume-manual-refund-workflow.use-case';
import {
  ManualRefundBreakGlassDto,
  ManualRefundReadinessResponseDto,
  ManualRefundWorkflowControlDto,
  ManualRefundWorkflowEnableResponseDto,
  ManualRefundWorkflowStateDto,
} from './dto/payments.dto';

@ApiTags('platform-manual-refunds')
@Controller('platform/tenants/:tenantId/refunds')
export class PlatformManualRefundController {
  constructor(
    private readonly breakGlass: BreakGlassCompleteManualRefundUseCase,
    private readonly enableWorkflow: EnableManualRefundWorkflowUseCase,
    private readonly getReadiness: GetManualRefundReadinessUseCase,
    private readonly pauseWorkflow: PauseManualRefundWorkflowUseCase,
    private readonly resumeWorkflow: ResumeManualRefundWorkflowUseCase,
  ) {}

  @RequirePermissions('platform.tenants.write')
  @Get('readiness')
  @Header('Cache-Control', 'no-store')
  @UuidParam('tenantId')
  @ApiOperation({ summary: 'Inspect readiness for manual refund V2 rollout' })
  @ApiOkResponse({ type: ManualRefundReadinessResponseDto })
  async readiness(@Param('tenantId') tenantId: string): Promise<ManualRefundReadinessResponse> {
    return this.getReadiness.execute(tenantId);
  }

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


  @RequirePermissions('platform.tenants.write')
  @Post('pause-workflow')
  @HttpCode(200)
  @UuidParam('tenantId')
  @ApiOperation({ summary: 'Pause manual refund V2 without altering pending operations' })
  @ApiOkResponse({ type: ManualRefundWorkflowStateDto })
  async pause(
    @Param('tenantId') tenantId: string,
    @Body() input: ManualRefundWorkflowControlDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<ManualRefundWorkflowState> {
    return this.pauseWorkflow.execute(tenantId, input as ManualRefundWorkflowControlInput, principal.userId);
  }

  @RequirePermissions('platform.tenants.write')
  @Post('resume-workflow')
  @HttpCode(200)
  @UuidParam('tenantId')
  @ApiOperation({ summary: 'Resume a paused manual refund V2 workflow' })
  @ApiOkResponse({ type: ManualRefundWorkflowStateDto })
  async resume(
    @Param('tenantId') tenantId: string,
    @Body() input: ManualRefundWorkflowControlDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<ManualRefundWorkflowState> {
    return this.resumeWorkflow.execute(tenantId, input as ManualRefundWorkflowControlInput, principal.userId);
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
