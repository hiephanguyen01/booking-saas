import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { uuidSchema, type PricingRuleResponse } from '@booking/contracts';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import { CreatePricingRuleUseCase } from '../../application/use-cases/create-pricing-rule.use-case';
import { ListPricingRulesUseCase } from '../../application/use-cases/list-pricing-rules.use-case';
import { DeletePricingRuleUseCase } from '../../application/use-cases/delete-pricing-rule.use-case';
import { toPricingRuleResponse } from '../../application/listing.mapper';
import { UuidParam } from '../../../../shared/openapi/decorators';
import { PricingRuleDto, PricingRuleResponseDto } from './dto/listing.dto';

@ApiTags('tenant-pricing-rules')
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
  @ApiOperation({ summary: "List a listing's pricing rules" })
  @UuidParam('listingId')
  @ApiOkResponse({ type: [PricingRuleResponseDto] })
  async list(
    @Param('listingId', new ZodValidationPipe(uuidSchema)) listingId: string,
  ): Promise<PricingRuleResponse[]> {
    const items = await this.listRules.execute(this.tenantContext.tenantIdOrThrow(), listingId);
    return items.map(toPricingRuleResponse);
  }

  @RequirePermissions('tenant.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post()
  @ApiOperation({ summary: 'Create a pricing rule for a listing' })
  @UuidParam('listingId')
  @ApiCreatedResponse({ type: PricingRuleResponseDto })
  async create(
    @Param('listingId', new ZodValidationPipe(uuidSchema)) listingId: string,
    @Body() input: PricingRuleDto,
  ): Promise<PricingRuleResponse> {
    return toPricingRuleResponse(
      await this.createRule.execute(this.tenantContext.tenantIdOrThrow(), listingId, input),
    );
  }

  @RequirePermissions('tenant.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Delete(':ruleId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a pricing rule' })
  @UuidParam('ruleId')
  @ApiNoContentResponse()
  async remove(@Param('ruleId', new ZodValidationPipe(uuidSchema)) ruleId: string): Promise<void> {
    await this.deleteRule.execute(this.tenantContext.tenantIdOrThrow(), ruleId);
  }
}
