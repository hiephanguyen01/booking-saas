import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
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
  type AvailabilityExceptionResponse,
  type AvailabilityRuleResponse,
} from '@booking/shared';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { UuidParam } from '../../../../shared/openapi/decorators';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import { ManageAvailabilityUseCase } from '../../application/use-cases/manage-availability.use-case';
import { toExceptionResponse, toRuleResponse } from '../../application/scheduling.mapper';
import {
  AvailabilityExceptionDto,
  AvailabilityExceptionResponseDto,
  AvailabilityRuleResponseDto,
  SetAvailabilityRulesDto,
} from './dto/scheduling.dto';

/** Tenant-side availability management (§7.4/§9). Scope via x-tenant-id. */
@ApiTags('tenant-availability')
@Controller('tenant')
export class TenantAvailabilityController {
  constructor(
    private readonly manage: ManageAvailabilityUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  private ctx() {
    return { tenantId: this.tenantContext.tenantIdOrThrow() };
  }

  @RequirePermissions('tenant.listings.read')
  @Get('listings/:id/availability-rules')
  @ApiOperation({ summary: 'List a listing weekly availability rules' })
  @UuidParam()
  @ApiOkResponse({ type: [AvailabilityRuleResponseDto] })
  async listRules(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<AvailabilityRuleResponse[]> {
    return (await this.manage.listRules(this.ctx(), id)).map(toRuleResponse);
  }

  @RequirePermissions('tenant.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Put('listings/:id/availability-rules')
  @ApiOperation({ summary: 'Replace a listing whole weekly availability rule set' })
  @UuidParam()
  @ApiOkResponse({ type: [AvailabilityRuleResponseDto] })
  async setRules(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() body: SetAvailabilityRulesDto,
  ): Promise<AvailabilityRuleResponse[]> {
    return (await this.manage.setRules(this.ctx(), id, body.rules)).map(toRuleResponse);
  }

  @RequirePermissions('tenant.listings.read')
  @Get('resources/:id/availability-exceptions')
  @ApiOperation({ summary: 'List a resource date-specific availability exceptions' })
  @UuidParam()
  @ApiOkResponse({ type: [AvailabilityExceptionResponseDto] })
  async listExceptions(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<AvailabilityExceptionResponse[]> {
    return (await this.manage.listExceptions(this.ctx(), id)).map(toExceptionResponse);
  }

  @RequirePermissions('tenant.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post('resources/:id/availability-exceptions')
  @ApiOperation({ summary: 'Add a date-specific availability exception to a resource' })
  @UuidParam()
  @ApiCreatedResponse({ type: AvailabilityExceptionResponseDto })
  async addException(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() body: AvailabilityExceptionDto,
  ): Promise<AvailabilityExceptionResponse> {
    return toExceptionResponse(await this.manage.addException(this.ctx(), id, body));
  }

  @RequirePermissions('tenant.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
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
    await this.manage.deleteException(this.ctx(), id, exceptionId);
  }
}
