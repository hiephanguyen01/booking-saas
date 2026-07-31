import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../domain/ports/tenant-repository.port';

export interface ApplyLegalReadinessInput {
  legalReady: boolean;
  publishedCount: number;
  /** DB-clock emit time of the event carrying this snapshot. */
  emittedAt: Date;
}

/**
 * Outbox consumer for `legal.readiness_changed`. The `legal` module computes
 * readiness itself and emits it as a payload — this use-case only writes the
 * two columns it is given. It never imports from `legal` and never reads
 * `legal_documents`, which is what keeps `tenancy` on the acyclic side of the
 * module graph (§7).
 *
 * Because the payload is an absolute snapshot rather than a delta, and outbox
 * delivery is at-least-once and out of order, the write is a compare-and-set on
 * `emittedAt`: a redelivered older event is dropped instead of resurrecting a
 * readiness state the tenant has since left. This column decides whether a
 * storefront serves traffic at all, so a stale write is not a cosmetic bug.
 */
@Injectable()
export class ApplyLegalReadinessUseCase {
  private readonly logger = new Logger(ApplyLegalReadinessUseCase.name);

  constructor(@Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository) {}

  async execute(tenantId: string, input: ApplyLegalReadinessInput): Promise<void> {
    const applied = await this.tenants.setLegalReadiness(
      tenantId,
      input.legalReady ? new Date() : null,
      input.publishedCount,
      input.emittedAt,
    );
    if (!applied) {
      this.logger.warn(
        `skipped stale legal.readiness_changed for tenant ${tenantId} (emitted ${input.emittedAt.toISOString()})`,
      );
    }
  }
}
