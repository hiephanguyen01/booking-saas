import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  uuidSchema,
  type PricingRuleBulkResult,
  type PricingRuleResponse,
} from '@booking/contracts';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { UuidParam } from '../../../../shared/openapi/decorators';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import { CreatePartnerPricingRuleUseCase } from '../../application/use-cases/create-partner-pricing-rule.use-case';
import { CreatePartnerPricingRuleRangeUseCase } from '../../application/use-cases/create-partner-pricing-rule-range.use-case';
import { DeletePartnerPricingRuleUseCase } from '../../application/use-cases/delete-partner-pricing-rule.use-case';
import { ListPartnerPricingRulesUseCase } from '../../application/use-cases/list-partner-pricing-rules.use-case';
import { toPricingRuleBulkResult, toPricingRuleResponse } from '../../application/listing.mapper';
import {
  CalendarRangeQueryDto,
  PricingRuleBulkResultDto,
  PricingRuleDto,
  PricingRuleRangeDto,
  PricingRuleResponseDto,
} from './dto/listing.dto';

@ApiTags('partner-pricing-rules')
@Controller('partner/listings/:listingId/pricing-rules')
export class PartnerPricingRuleController {
  constructor(
    private readonly createRule: CreatePartnerPricingRuleUseCase,
    private readonly createRuleRange: CreatePartnerPricingRuleRangeUseCase,
    private readonly listRules: ListPartnerPricingRulesUseCase,
    private readonly deleteRule: DeletePartnerPricingRuleUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('partner.listings.read')
  @Get()
  @ApiOperation({
    summary: "List an owned listing's pricing rules",
    description:
      'Pass `from`/`to` (together) to narrow date-scoped rules to a calendar window; recurring rules are always returned.',
  })
  @UuidParam('listingId')
  @ApiOkResponse({ type: [PricingRuleResponseDto] })
  async list(
    @Param('listingId', new ZodValidationPipe(uuidSchema)) listingId: string,
    @Query() range: CalendarRangeQueryDto,
  ): Promise<PricingRuleResponse[]> {
    const items = await this.listRules.execute(
      this.tenantContext.tenantIdOrThrow(),
      this.tenantContext.partnerIdOrThrow(),
      listingId,
      range,
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

  /**
   * Apply one price across a span of dates. `daily` writes a single
   * `date_range` rule; `hourly` writes one rule per date. Dates the listing
   * cannot sell come back in `skipped` instead of failing the whole span.
   *
   * Declared before `:ruleId` routes is unnecessary (different verb), but it
   * stays next to `create` because it is the same operation at range scale.
   */
  @RequirePermissions('partner.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post('bulk')
  @ApiOperation({ summary: 'Apply one pricing rule across a range of dates' })
  @UuidParam('listingId')
  @ApiCreatedResponse({ type: PricingRuleBulkResultDto })
  async createRange(
    @Param('listingId', new ZodValidationPipe(uuidSchema)) listingId: string,
    @Body() input: PricingRuleRangeDto,
  ): Promise<PricingRuleBulkResult> {
    return toPricingRuleBulkResult(
      await this.createRuleRange.execute(
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
