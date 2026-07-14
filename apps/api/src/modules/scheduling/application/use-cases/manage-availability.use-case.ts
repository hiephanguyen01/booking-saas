import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AvailabilityExceptionInput, AvailabilityRuleInput } from '@booking/contracts';
import { TenantDbService, type PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import { addDays, utcNow } from '../../../../shared/time/time';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
} from '../../../listing/domain/ports/listing-repository.port';
import {
  RESOURCE_REPOSITORY,
  type IResourceRepository,
} from '../../../listing/domain/ports/resource-repository.port';
import {
  AVAILABILITY_RULE_REPOSITORY,
  type AvailabilityRuleRecord,
  type IAvailabilityRuleRepository,
} from '../../domain/ports/availability-rule-repository.port';
import {
  AVAILABILITY_EXCEPTION_REPOSITORY,
  type AvailabilityExceptionRecord,
  type IAvailabilityExceptionRepository,
} from '../../domain/ports/availability-exception-repository.port';
import { AvailabilityCacheInvalidator } from '../availability-cache-invalidator';

/** Tenant/partner context. `partnerId` set → the target must be the partner's own. */
export interface ManageContext {
  tenantId: string;
  partnerId?: string;
}

/** Manage availability rules (per listing) + exceptions (per resource) — §7.4/§9. */
@Injectable()
export class ManageAvailabilityUseCase {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    @Inject(RESOURCE_REPOSITORY) private readonly resources: IResourceRepository,
    @Inject(AVAILABILITY_RULE_REPOSITORY) private readonly rules: IAvailabilityRuleRepository,
    @Inject(AVAILABILITY_EXCEPTION_REPOSITORY)
    private readonly exceptions: IAvailabilityExceptionRepository,
    private readonly tenantDb: TenantDbService,
    private readonly cacheInvalidator: AvailabilityCacheInvalidator,
  ) {}

  listRules(ctx: ManageContext, listingId: string): Promise<AvailabilityRuleRecord[]> {
    return this.tenantDb.forTenant(ctx.tenantId, async (tx) => {
      await this.assertListing(tx, listingId, ctx.partnerId);
      return this.rules.listByListing(tx, listingId);
    });
  }

  async setRules(
    ctx: ManageContext,
    listingId: string,
    rules: AvailabilityRuleInput[],
  ): Promise<AvailabilityRuleRecord[]> {
    const { saved, resourceId } = await this.tenantDb.forTenant(ctx.tenantId, async (tx) => {
      const listing = await this.assertListing(tx, listingId, ctx.partnerId);
      const saved = await this.rules.replaceForListing(tx, ctx.tenantId, listingId, rules);
      return { saved, resourceId: listing.resourceId };
    });
    // Open windows changed → the cached slots for this resource are stale (§9.1).
    await this.cacheInvalidator.invalidateResource(resourceId);
    return saved;
  }

  listExceptions(ctx: ManageContext, resourceId: string): Promise<AvailabilityExceptionRecord[]> {
    return this.tenantDb.forTenant(ctx.tenantId, async (tx) => {
      await this.assertResource(tx, resourceId, ctx.partnerId);
      const today = utcNow().toISOString().slice(0, 10);
      const to = addDays(utcNow(), 180).toISOString().slice(0, 10);
      return this.exceptions.listByResource(tx, resourceId, today, to);
    });
  }

  async addException(
    ctx: ManageContext,
    resourceId: string,
    data: AvailabilityExceptionInput,
  ): Promise<AvailabilityExceptionRecord> {
    const created = await this.tenantDb.forTenant(ctx.tenantId, async (tx) => {
      await this.assertResource(tx, resourceId, ctx.partnerId);
      return this.exceptions.create(tx, ctx.tenantId, resourceId, data);
    });
    await this.cacheInvalidator.invalidateResource(resourceId);
    return created;
  }

  async deleteException(ctx: ManageContext, resourceId: string, exceptionId: string): Promise<void> {
    await this.tenantDb.forTenant(ctx.tenantId, async (tx) => {
      await this.assertResource(tx, resourceId, ctx.partnerId);
      const existing = await this.exceptions.findById(tx, exceptionId);
      if (!existing || existing.resourceId !== resourceId) {
        throw new NotFoundException({ statusCode: 404, code: 'EXCEPTION_NOT_FOUND', message: 'Exception not found' });
      }
      await this.exceptions.delete(tx, exceptionId);
    });
    await this.cacheInvalidator.invalidateResource(resourceId);
  }

  private async assertListing(
    tx: PrismaTx,
    listingId: string,
    partnerId?: string,
  ): Promise<{ resourceId: string }> {
    const listing = await this.listings.findById(tx, listingId);
    if (!listing) {
      throw new NotFoundException({ statusCode: 404, code: 'LISTING_NOT_FOUND', message: 'Listing not found' });
    }
    if (partnerId && listing.partnerId !== partnerId) {
      throw new ForbiddenException({ statusCode: 403, code: 'NOT_OWNED', message: 'Listing belongs to another partner' });
    }
    return { resourceId: listing.resourceId };
  }

  private async assertResource(tx: PrismaTx, resourceId: string, partnerId?: string): Promise<void> {
    const resource = await this.resources.findById(tx, resourceId);
    if (!resource) {
      throw new NotFoundException({ statusCode: 404, code: 'RESOURCE_NOT_FOUND', message: 'Resource not found' });
    }
    if (partnerId && resource.partnerId !== partnerId) {
      throw new ForbiddenException({ statusCode: 403, code: 'NOT_OWNED', message: 'Resource belongs to another partner' });
    }
  }
}
