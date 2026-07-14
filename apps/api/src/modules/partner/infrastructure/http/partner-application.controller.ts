import { Body, Controller, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type PartnerResponse } from '@booking/shared';
import { AuthenticatedOnly } from '../../../identity-access/infrastructure/http/decorators/authenticated-only.decorator';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { ApplyAsPartnerUseCase } from '../../application/use-cases/apply-as-partner.use-case';
import { toPartnerResponse } from '../../application/partner.mapper';
import { PartnerApplyDto, PartnerResponseDto } from './dto/partner.dto';

/** Partner self-signup (§7.3) — any logged-in user may apply to a tenant. */
@ApiTags('partners')
@Controller('partners')
export class PartnerApplicationController {
  constructor(private readonly applyAsPartner: ApplyAsPartnerUseCase) {}

  @AuthenticatedOnly()
  @Post('apply')
  @ApiOperation({ summary: 'Apply to become a partner under a tenant' })
  @ApiCreatedResponse({ type: PartnerResponseDto })
  async apply(
    @CurrentPrincipal() principal: SessionPrincipal,
    @Body() input: PartnerApplyDto,
  ): Promise<PartnerResponse> {
    return toPartnerResponse(await this.applyAsPartner.execute(principal.userId, input));
  }
}
