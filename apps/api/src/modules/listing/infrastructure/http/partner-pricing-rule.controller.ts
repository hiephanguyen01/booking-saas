import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { uuidSchema, type PricingRuleResponse } from '@booking/contracts';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { UuidParam } from '../../../../shared/openapi/decorators';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import { CreatePartnerPricingRuleUseCase } from '../../application/use-cases/create-partner-pricing-rule.use-case';
import { DeletePartnerPricingRuleUseCase } from '../../application/use-cases/delete-partner-pricing-rule.use-case';
import { ListPartnerPricingRulesUseCase } from '../../application/use-cases/list-partner-pricing-rules.use-case';
import { toPricingRuleResponse } from '../../application/listing.mapper';
import { PricingRuleDto, PricingRuleResponseDto } from './dto/listing.dto';

@ApiTags('partner-pricing-rules')
@Controller('partner/listings/:listingId/pricing-rules')
export class PartnerPricingRuleController {
  constructor(
    private readonly createRule: CreatePartnerPricingRuleUseCase,
    private readonly listRules: ListPartnerPricingRulesUseCase,
    private readonly deleteRule: DeletePartnerPricingRuleUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('partner.listings.read')
  @Get()
  @ApiOperation({ summary: "List an owned listing's pricing rules" })
  @UuidParam('listingId')
  @ApiOkResponse({ type: [PricingRuleResponseDto] })
  async list(
    @Param('listingId', new ZodValidationPipe(uuidSchema)) listingId: string,
  ): Promise<PricingRuleResponse[]> {
    const items = await this.listRules.execute(
      this.tenantContext.tenantIdOrThrow(),
      this.tenantContext.partnerIdOrThrow(),
      listingId,
    );
    return items.map(toPricingRuleResponse);
  }

  @RequirePermissions('partner.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post()
  @ApiOperation({ summary: 'Create an owned listing pricing rule' })
  @UuidParam('listingId')
  @ApiCreatedResponse({ type: PricingRuleResponseDto })
  async create(
    @Param('listingId', new ZodValidationPipe(uuidSchema)) listingId: string,
    @Body() input: PricingRuleDto,
  ): Promise<PricingRuleResponse> {
    return toPricingRuleResponse(
      await this.createRule.execute(
        this.tenantContext.tenantIdOrThrow(),
        this.tenantContext.partnerIdOrThrow(),
        listingId,
        input,
      ),
    );
  }

  @RequirePermissions('partner.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Delete(':ruleId')
  @HttpCode(204)
  @UuidParam('listingId')
  @UuidParam('ruleId')
  @ApiNoContentResponse()
  async remove(
    @Param('listingId', new ZodValidationPipe(uuidSchema)) listingId: string,
    @Param('ruleId', new ZodValidationPipe(uuidSchema)) ruleId: string,
  ): Promise<void> {
    await this.deleteRule.execute(
      this.tenantContext.tenantIdOrThrow(),
      this.tenantContext.partnerIdOrThrow(),
      listingId,
      ruleId,
    );
  }
}
