import { Inject, Injectable } from '@nestjs/common';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../domain/ports/tenant-repository.port';

/**
 * Outbox consumer for `legal.readiness_changed`. The `legal` module computes
 * readiness itself and emits it as a payload — this use-case only writes the
 * two columns it is given. It never imports from `legal` and never reads
 * `legal_documents`, which is what keeps `tenancy` on the acyclic side of the
 * module graph (§7).
 */
@Injectable()
export class ApplyLegalReadinessUseCase {
  constructor(@Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository) {}

  async execute(
    tenantId: string,
    input: { legalReady: boolean; publishedCount: number },
  ): Promise<void> {
    await this.tenants.setLegalReadiness(
      tenantId,
      input.legalReady ? new Date() : null,
      input.publishedCount,
    );
  }
}
