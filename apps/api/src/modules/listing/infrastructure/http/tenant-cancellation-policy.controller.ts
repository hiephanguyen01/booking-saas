import type { CancellationPolicyResponse } from '@booking/contracts';
import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { ListTenantCancellationPoliciesUseCase } from '../../application/use-cases/list-tenant-cancellation-policies.use-case';
import { CancellationPolicyResponseDto } from './dto/listing.dto';

/** Tenant-level shared policies — the picker for the tenant's fallback default (§11.3). */
@ApiTags('tenant-cancellation-policies')
@Controller('tenant/cancellation-policies')
export class TenantCancellationPolicyController {
  constructor(
    private readonly listPolicies: ListTenantCancellationPoliciesUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @RequirePermissions('tenant.settings.manage')
  @Get()
  @ApiOkResponse({ type: [CancellationPolicyResponseDto] })
  list(): Promise<CancellationPolicyResponse[]> {
    return this.listPolicies.execute(this.tenantContext.tenantIdOrThrow());
  }
}
