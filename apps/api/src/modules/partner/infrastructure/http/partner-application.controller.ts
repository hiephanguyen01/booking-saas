import { Body, Controller, Post } from '@nestjs/common';
import { partnerApplyInputSchema, type PartnerApplyInput, type PartnerResponse } from '@booking/contracts';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { AuthenticatedOnly } from '../../../identity-access/infrastructure/http/decorators/authenticated-only.decorator';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { ApplyAsPartnerUseCase } from '../../application/use-cases/apply-as-partner.use-case';
import { toPartnerResponse } from '../../application/partner.mapper';

/** Partner self-signup (§7.3) — any logged-in user may apply to a tenant. */
@Controller('partners')
export class PartnerApplicationController {
  constructor(private readonly applyAsPartner: ApplyAsPartnerUseCase) {}

  @AuthenticatedOnly()
  @Post('apply')
  async apply(
    @CurrentPrincipal() principal: SessionPrincipal,
    @Body(new ZodValidationPipe(partnerApplyInputSchema)) input: PartnerApplyInput,
  ): Promise<PartnerResponse> {
    return toPartnerResponse(await this.applyAsPartner.execute(principal.userId, input));
  }
}
