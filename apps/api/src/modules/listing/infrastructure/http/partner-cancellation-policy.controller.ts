import type { CancellationPolicySummary } from '@booking/contracts';
import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { ListCancellationPoliciesUseCase } from '../../application/use-cases/list-cancellation-policies.use-case';

@ApiTags('partner-cancellation-policies')
@Controller('partner/cancellation-policies')
export class PartnerCancellationPolicyController {
  constructor(private readonly listPolicies: ListCancellationPoliciesUseCase, private readonly tenantContext: TenantContextService) {}

  @RequirePermissions('partner.listings.read')
  @Get()
  @ApiOkResponse({ description: 'Cancellation policies available to the partner' })
  list(): Promise<CancellationPolicySummary[]> {
    return this.listPolicies.execute(this.tenantContext.tenantIdOrThrow());
  }
}
