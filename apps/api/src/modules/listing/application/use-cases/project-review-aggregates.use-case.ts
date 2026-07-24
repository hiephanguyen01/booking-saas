import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  REVIEW_AGGREGATE_PROJECTOR,
  type IReviewAggregateProjector,
} from '../../domain/ports/review-aggregate-projector.port';

@Injectable()
export class ProjectReviewAggregatesUseCase {
  constructor(
    @Inject(REVIEW_AGGREGATE_PROJECTOR)
    private readonly projector: IReviewAggregateProjector,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    payload: { listingId?: string; groupId?: string | null },
  ): Promise<void> {
    const listingId = payload.listingId;
    if (!listingId) return;
    await this.tenantDb.forTenant(tenantId, (tx) =>
      this.projector.project(tx, listingId, payload.groupId ?? null),
    );
  }
}
