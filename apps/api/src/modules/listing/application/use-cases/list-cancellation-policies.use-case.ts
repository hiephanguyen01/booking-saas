import { Inject, Injectable } from '@nestjs/common';
import type { CancellationPolicyResponse } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { toCancellationPolicyResponse } from '../listing.mapper';
import {
  CANCELLATION_POLICY_REPOSITORY,
  type ICancellationPolicyRepository,
} from '../../domain/ports/cancellation-policy-repository.port';

/** Policies the partner may attach to a listing or manage: their own + tenant-level. */
@Injectable()
export class ListCancellationPoliciesUseCase {
  constructor(
    @Inject(CANCELLATION_POLICY_REPOSITORY)
    private readonly policies: ICancellationPolicyRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, partnerId: string): Promise<CancellationPolicyResponse[]> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const [rows, defaultId] = await Promise.all([
        this.policies.listForPartner(tx, partnerId),
        this.policies.findPartnerDefaultId(tx, partnerId),
      ]);
      return rows.map((p) => toCancellationPolicyResponse(p, defaultId));
    });
  }
}
