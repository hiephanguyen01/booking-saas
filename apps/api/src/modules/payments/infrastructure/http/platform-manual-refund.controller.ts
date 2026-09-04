import { Body, Controller, HttpCode, Ip, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { UuidParam } from '../../../../shared/openapi/decorators';
import { BreakGlassCompleteManualRefundUseCase } from '../../application/use-cases/break-glass-complete-manual-refund.use-case';
import { ManualRefundBreakGlassDto } from './dto/payments.dto';

@ApiTags('platform-manual-refunds')
@Controller('platform/tenants/:tenantId/refunds')
export class PlatformManualRefundController {
  constructor(private readonly breakGlass: BreakGlassCompleteManualRefundUseCase) {}

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
