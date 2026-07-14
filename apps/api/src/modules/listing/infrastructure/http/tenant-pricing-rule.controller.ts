import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  pricingRuleInputSchema,
  uuidSchema,
  type PricingRuleInput,
  type PricingRuleResponse,
} from '@booking/contracts';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import { CreatePricingRuleUseCase } from '../../application/use-cases/create-pricing-rule.use-case';
import { ListPricingRulesUseCase } from '../../application/use-cases/list-pricing-rules.use-case';
import { DeletePricingRuleUseCase } from '../../application/use-cases/delete-pricing-rule.use-case';
import { toPricingRuleResponse } from '../../application/listing.mapper';

@Controller('tenant/listings/:listingId/pricing-rules')
export class TenantPricingRuleController {
  constructor(
    private readonly createRule: CreatePricingRuleUseCase,
    private readonly listRules: ListPricingRulesUseCase,
    private readonly deleteRule: DeletePricingRuleUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('tenant.listings.read')
  @Get()
  async list(
    @Param('listingId', new ZodValidationPipe(uuidSchema)) listingId: string,
  ): Promise<PricingRuleResponse[]> {
    const items = await this.listRules.execute(this.tenantContext.tenantIdOrThrow(), listingId);
    return items.map(toPricingRuleResponse);
  }

  @RequirePermissions('tenant.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post()
  async create(
    @Param('listingId', new ZodValidationPipe(uuidSchema)) listingId: string,
    @Body(new ZodValidationPipe(pricingRuleInputSchema)) input: PricingRuleInput,
  ): Promise<PricingRuleResponse> {
    return toPricingRuleResponse(
      await this.createRule.execute(this.tenantContext.tenantIdOrThrow(), listingId, input),
    );
  }

  @RequirePermissions('tenant.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Delete(':ruleId')
  @HttpCode(204)
  async remove(
    @Param('ruleId', new ZodValidationPipe(uuidSchema)) ruleId: string,
  ): Promise<void> {
    await this.deleteRule.execute(this.tenantContext.tenantIdOrThrow(), ruleId);
  }
}
