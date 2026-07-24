import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import {
  LISTING_READ_REPOSITORY,
  type IListingReadRepository,
  type PublicListingFilter,
  type PublicListingRecord,
} from '../../domain/ports/listing-read-repository.port';

export const MAX_FEATURED_LISTINGS = 24;
const GROUP_OVERFETCH_FACTOR = 3;

export function uniquePublicListingRecords(
  records: PublicListingRecord[],
  limit: number,
): PublicListingRecord[] {
  const unique: PublicListingRecord[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    const key = record.group?.id ?? record.id;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(record);
    if (unique.length >= limit) break;
  }
  return unique;
}

/** Storefront listing results, filtered by type + dynamic `attr.*` (read-only). */
@Injectable()
export class ListPublicListingsUseCase {
  constructor(
    @Inject(LISTING_READ_REPOSITORY) private readonly listings: IListingReadRepository,
    private readonly resolveTenant: ResolveTenantByHostUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(host: string, filter: PublicListingFilter): Promise<PublicListingRecord[]> {
    const tenant = await this.resolveTenant.execute(host);
    return this.tenantDb.forTenant(tenant.id, (tx) => this.listings.findPublished(tx, filter));
  }

  async featured(host: string, requestedLimit: number): Promise<PublicListingRecord[]> {
    const limit = Math.max(1, Math.min(MAX_FEATURED_LISTINGS, requestedLimit));
    const rows = await this.execute(host, {
      attrFilters: {},
      limit: limit * GROUP_OVERFETCH_FACTOR,
    });
    return uniquePublicListingRecords(rows, limit);
  }
}
