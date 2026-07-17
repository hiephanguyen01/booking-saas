import { Injectable } from '@nestjs/common';
import type { CancellationPolicySummary } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { ICancellationPolicyRepository } from '../../domain/ports/cancellation-policy-repository.port';

@Injectable()
export class PrismaCancellationPolicyRepository implements ICancellationPolicyRepository {
  async list(tx: PrismaTx): Promise<CancellationPolicySummary[]> {
    const policies = await tx.cancellationPolicy.findMany({ orderBy: { name: 'asc' } });
    return policies.map((policy) => ({ id: policy.id, name: policy.name, rules: policy.rules }));
  }
}
