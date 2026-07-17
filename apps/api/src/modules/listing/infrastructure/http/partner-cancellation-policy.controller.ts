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
import { UuidParam } from '../../../../shared/openapi/decorators';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { RequireActiveSubscriptionGuard } from '../../../tenancy/infrastructure/http/guards/require-active-subscription.guard';
import { CreateCancellationPolicyUseCase } from '../../application/use-cases/create-cancellation-policy.use-case';
import { DeleteCancellationPolicyUseCase } from '../../application/use-cases/delete-cancellation-policy.use-case';
import { GetCancellationPolicyUseCase } from '../../application/use-cases/get-cancellation-policy.use-case';
import { ListCancellationPoliciesUseCase } from '../../application/use-cases/list-cancellation-policies.use-case';
import { UpdateCancellationPolicyUseCase } from '../../application/use-cases/update-cancellation-policy.use-case';
import {
  CancellationPolicyResponseDto,
  CreateCancellationPolicyDto,
  UpdateCancellationPolicyDto,
} from './dto/listing.dto';

/** Partner self-service CRUD for the cancellation policies they own (§11.3). */
@ApiTags('partner-cancellation-policies')
@Controller('partner/cancellation-policies')
export class PartnerCancellationPolicyController {
  constructor(
    private readonly listPolicies: ListCancellationPoliciesUseCase,
    private readonly getPolicy: GetCancellationPolicyUseCase,
    private readonly createPolicy: CreateCancellationPolicyUseCase,
    private readonly updatePolicy: UpdateCancellationPolicyUseCase,
    private readonly deletePolicy: DeleteCancellationPolicyUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('partner.listings.read')
  @Get()
  @ApiOkResponse({ type: [CancellationPolicyResponseDto] })
  list(): Promise<CancellationPolicyResponse[]> {
    return this.listPolicies.execute(
      this.tenantContext.tenantIdOrThrow(),
      this.tenantContext.partnerIdOrThrow(),
    );
  }

  @RequirePermissions('partner.listings.read')
  @Get(':id')
  @UuidParam()
  @ApiOkResponse({ type: CancellationPolicyResponseDto })
  get(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<CancellationPolicyResponse> {
    return this.getPolicy.execute(
      this.tenantContext.tenantIdOrThrow(),
      this.tenantContext.partnerIdOrThrow(),
      id,
    );
  }

  @RequirePermissions('partner.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Post()
  @ApiCreatedResponse({ type: CancellationPolicyResponseDto })
  create(@Body() input: CreateCancellationPolicyDto): Promise<CancellationPolicyResponse> {
    return this.createPolicy.execute(
      this.tenantContext.tenantIdOrThrow(),
      this.tenantContext.partnerIdOrThrow(),
      input,
    );
  }

  @RequirePermissions('partner.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Patch(':id')
  @UuidParam()
  @ApiOkResponse({ type: CancellationPolicyResponseDto })
  update(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() input: UpdateCancellationPolicyDto,
  ): Promise<CancellationPolicyResponse> {
    return this.updatePolicy.execute(
      this.tenantContext.tenantIdOrThrow(),
      this.tenantContext.partnerIdOrThrow(),
      id,
      input,
    );
  }

  @RequirePermissions('partner.listings.write')
  @UseGuards(RequireActiveSubscriptionGuard)
  @Delete(':id')
  @HttpCode(204)
  @UuidParam()
  @ApiNoContentResponse()
  async remove(@Param('id', new ZodValidationPipe(uuidSchema)) id: string): Promise<void> {
    await this.deletePolicy.execute(
      this.tenantContext.tenantIdOrThrow(),
      this.tenantContext.partnerIdOrThrow(),
      id,
    );
  }
}
