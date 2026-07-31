import {
  uuidSchema,
  type AvailabilityExceptionResponse,
  type AvailabilityRuleResponse
} from '@booking/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
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
import { UuidParam } from '../../../../shared/openapi/decorators';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { RequireCurrentAgreementGuard } from '../../../legal/infrastructure/http/guards/require-current-agreement.guard';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import { toExceptionResponse, toRuleResponse } from '../../application/scheduling.mapper';
import { AddAvailabilityExceptionUseCase } from '../../application/use-cases/add-availability-exception.use-case';
import { AddAvailabilityExceptionRangeUseCase } from '../../application/use-cases/add-availability-exception-range.use-case';
import { ClearAvailabilityExceptionsRangeUseCase } from '../../application/use-cases/clear-availability-exceptions-range.use-case';
import { DeleteAvailabilityExceptionUseCase } from '../../application/use-cases/delete-availability-exception.use-case';
import { ListAvailabilityExceptionsUseCase } from '../../application/use-cases/list-availability-exceptions.use-case';
import { ListAvailabilityRulesUseCase } from '../../application/use-cases/list-availability-rules.use-case';
import { SetAvailabilityRulesUseCase } from '../../application/use-cases/set-availability-rules.use-case';
import {
  AvailabilityExceptionDto,
  AvailabilityExceptionRangeDto,
  AvailabilityExceptionResponseDto,
  AvailabilityRuleResponseDto,
  CalendarRangeQueryDto,
  RequiredCalendarRangeQueryDto,
  SetAvailabilityRulesDto,
} from './dto/scheduling.dto';

/** Partner-side availability management (§7.4/§9). Own listings/resources only; scope via x-partner-id. */
@ApiTags('partner-availability')
@Controller('partner')
export class PartnerAvailabilityController {
  constructor(
    private readonly listRulesUseCase: ListAvailabilityRulesUseCase,
    private readonly setRulesUseCase: SetAvailabilityRulesUseCase,
    private readonly listExceptionsUseCase: ListAvailabilityExceptionsUseCase,
    private readonly addExceptionUseCase: AddAvailabilityExceptionUseCase,
    private readonly addExceptionRangeUseCase: AddAvailabilityExceptionRangeUseCase,
    private readonly clearExceptionRangeUseCase: ClearAvailabilityExceptionsRangeUseCase,
    private readonly deleteExceptionUseCase: DeleteAvailabilityExceptionUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  private ctx() {
    return {
      tenantId: this.tenantContext.tenantIdOrThrow(),
      partnerId: this.tenantContext.partnerIdOrThrow(),
    };
  }

  @RequirePermissions('partner.availability.manage')
  @Get('listings/:id/availability-rules')
  @ApiOperation({ summary: 'List a listing weekly availability rules' })
  @UuidParam()
  @ApiOkResponse({ type: [AvailabilityRuleResponseDto] })
  async listRules(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<AvailabilityRuleResponse[]> {
    return (await this.listRulesUseCase.execute(this.ctx(), id)).map(toRuleResponse);
  }

  @RequirePermissions('partner.availability.manage')
  @UseGuards(RequireActiveSubscriptionGuard, RequireCurrentAgreementGuard)
  @Put('listings/:id/availability-rules')
  @ApiOperation({ summary: 'Replace a listing whole weekly availability rule set' })
  @UuidParam()
  @ApiOkResponse({ type: [AvailabilityRuleResponseDto] })
  async setRules(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() body: SetAvailabilityRulesDto,
  ): Promise<AvailabilityRuleResponse[]> {
    return (await this.setRulesUseCase.execute(this.ctx(), id, body.rules)).map(toRuleResponse);
  }

  @RequirePermissions('partner.availability.manage')
  @Get('resources/:id/availability-exceptions')
  @ApiOperation({
    summary: 'List a resource date-specific availability exceptions',
    description:
      'Pass `from`/`to` (together) to window the result — required when rendering a month outside the default near-term window.',
  })
  @UuidParam()
  @ApiOkResponse({ type: [AvailabilityExceptionResponseDto] })
  async listExceptions(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Query() range: CalendarRangeQueryDto,
  ): Promise<AvailabilityExceptionResponse[]> {
    return (await this.listExceptionsUseCase.execute(this.ctx(), id, range)).map(
      toExceptionResponse,
    );
  }

  @RequirePermissions('partner.availability.manage')
  @UseGuards(RequireActiveSubscriptionGuard, RequireCurrentAgreementGuard)
  @Post('resources/:id/availability-exceptions')
  @ApiOperation({ summary: 'Add a date-specific availability exception to a resource' })
  @UuidParam()
  @ApiCreatedResponse({ type: AvailabilityExceptionResponseDto })
  async addException(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() body: AvailabilityExceptionDto,
  ): Promise<AvailabilityExceptionResponse> {
    return toExceptionResponse(await this.addExceptionUseCase.execute(this.ctx(), id, body));
  }

  /**
   * Apply one exception to every date in a span, in a single transaction — the
   * calendar's range action. Per-date upsert, so re-applying is idempotent.
   * Declared before the `:exceptionId` delete route for readability only; the
   * paths do not collide.
   */
  @RequirePermissions('partner.availability.manage')
  @UseGuards(RequireActiveSubscriptionGuard, RequireCurrentAgreementGuard)
  @Post('resources/:id/availability-exceptions/bulk')
  @ApiOperation({ summary: 'Apply one availability exception across a range of dates' })
  @UuidParam()
  @ApiCreatedResponse({ type: [AvailabilityExceptionResponseDto] })
  async addExceptionRange(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() body: AvailabilityExceptionRangeDto,
  ): Promise<AvailabilityExceptionResponse[]> {
    return (await this.addExceptionRangeUseCase.execute(this.ctx(), id, body)).map(
      toExceptionResponse,
    );
  }

  /**
   * Hand a span of dates back to the weekly schedule by dropping their
   * overrides. `from`/`to` are REQUIRED — an unbounded delete here would mean
   * "clear the whole calendar", which no caller ever wants by accident.
   *
   * Declared before the `:exceptionId` route because `availability-exceptions`
   * with no trailing segment must not be captured as an id.
   */
  @RequirePermissions('partner.availability.manage')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Delete('resources/:id/availability-exceptions')
  @ApiOperation({ summary: 'Clear date-specific overrides across a range of dates' })
  @UuidParam()
  @ApiOkResponse({ schema: { properties: { cleared: { type: 'number' } } } })
  async clearExceptionRange(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Query() range: RequiredCalendarRangeQueryDto,
  ): Promise<{ cleared: number }> {
    return this.clearExceptionRangeUseCase.execute(this.ctx(), id, range);
  }

  @RequirePermissions('partner.availability.manage')
  @UseGuards(RequireActiveSubscriptionGuard, RequireCurrentAgreementGuard)
  @Delete('resources/:id/availability-exceptions/:exceptionId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a resource availability exception' })
  @UuidParam()
  @UuidParam('exceptionId')
  @ApiNoContentResponse()
  async deleteException(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Param('exceptionId', new ZodValidationPipe(uuidSchema)) exceptionId: string,
  ): Promise<void> {
    await this.deleteExceptionUseCase.execute(this.ctx(), id, exceptionId);
  }
}
