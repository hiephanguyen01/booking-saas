import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PublicPartnerProfileResponse } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import {
  PUBLIC_PARTNER_REPOSITORY,
  type IPublicPartnerRepository,
} from '../../domain/ports/public-partner-repository.port';

const CONTACT_PATTERN =
  /(?:\+?84|0)[\d\s._-]{8,13}\d|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|\bzalo\b|\b(?:https?:\/\/|www\.)\S+/i;

@Injectable()
export class GetPublicPartnerProfileUseCase {
  constructor(
    @Inject(PUBLIC_PARTNER_REPOSITORY) private readonly partners: IPublicPartnerRepository,
    private readonly resolveTenant: ResolveTenantByHostUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(host: string, slug: string): Promise<PublicPartnerProfileResponse> {
    const tenant = await this.resolveTenant.execute(host);
    const partner = await this.tenantDb.forTenant(tenant.id, (tx) =>
      this.partners.findProfile(tx, slug),
    );
    if (!partner)
      throw new NotFoundException({
        statusCode: 404,
        code: 'PUBLIC_PARTNER_NOT_FOUND',
        message: 'Public partner profile not found',
      });
    return {
      id: partner.id,
      name: partner.name,
      slug: partner.slug,
      description:
        partner.description && !CONTACT_PATTERN.test(partner.description)
          ? partner.description
          : null,
      logoUrl: partner.logoUrl,
      partnerType: partner.partnerType,
      identityVerified: partner.verifiedAt !== null,
      activeSince: partner.createdAt.toISOString(),
      stats: {
        publishedOfferings: partner.publishedOfferings,
        completedBookings: partner.completedBookings,
        ratingAvg: partner.ratingAvg,
        reviewCount: partner.reviewCount,
      },
      listingTypes: partner.listingTypes,
    };
  }
}
