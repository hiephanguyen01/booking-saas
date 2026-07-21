import { uuidSchema, type CancellationPolicyResponse } from '@booking/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { UuidParam } from '../../../../shared/openapi/decorators';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import { ListTenantCancellationPoliciesUseCase } from '../../application/use-cases/list-tenant-cancellation-policies.use-case';
import { CreateTenantCancellationPolicyUseCase } from '../../application/use-cases/create-tenant-cancellation-policy.use-case';
import { UpdateTenantCancellationPolicyUseCase } from '../../application/use-cases/update-tenant-cancellation-policy.use-case';
import { DeleteTenantCancellationPolicyUseCase } from '../../application/use-cases/delete-tenant-cancellation-policy.use-case';
import {
  CancellationPolicyResponseDto,
  CreateCancellationPolicyDto,
  UpdateCancellationPolicyDto,
} from './dto/listing.dto';

/** Tenant-level shared policies — the picker for the tenant's fallback default (§11.3). */
@ApiTags('tenant-cancellation-policies')
@Controller('tenant/cancellation-policies')
export class TenantCancellationPolicyController {
  constructor(
    private readonly listPolicies: ListTenantCancellationPoliciesUseCase,
    private readonly createPolicy: CreateTenantCancellationPolicyUseCase,
    private readonly updatePolicy: UpdateTenantCancellationPolicyUseCase,
    private readonly deletePolicy: DeleteTenantCancellationPolicyUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('tenant.settings.manage')
  @Get()
  @ApiOkResponse({ type: [CancellationPolicyResponseDto] })
  list(): Promise<CancellationPolicyResponse[]> {
    return this.listPolicies.execute(this.tenantContext.tenantIdOrThrow());
  }

  @RequirePermissions('tenant.settings.manage')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post()
  @ApiCreatedResponse({ type: CancellationPolicyResponseDto })
  create(@Body() input: CreateCancellationPolicyDto): Promise<CancellationPolicyResponse> {
    return this.createPolicy.execute(this.tenantContext.tenantIdOrThrow(), input);
  }

  @RequirePermissions('tenant.settings.manage')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Patch(':id')
  @UuidParam()
  @ApiOkResponse({ type: CancellationPolicyResponseDto })
  update(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() input: UpdateCancellationPolicyDto,
  ): Promise<CancellationPolicyResponse> {
    return this.updatePolicy.execute(this.tenantContext.tenantIdOrThrow(), id, input);
  }

  @RequirePermissions('tenant.settings.manage')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Delete(':id')
  @HttpCode(204)
  @UuidParam()
  @ApiNoContentResponse()
  async remove(@Param('id', new ZodValidationPipe(uuidSchema)) id: string): Promise<void> {
    await this.deletePolicy.execute(this.tenantContext.tenantIdOrThrow(), id);
  }
}
