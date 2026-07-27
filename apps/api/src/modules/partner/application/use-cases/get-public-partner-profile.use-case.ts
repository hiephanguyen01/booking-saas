import { Inject, Injectable } from '@nestjs/common';
import type { PublicPartnerProfileResponse } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import {
  PUBLIC_PARTNER_REPOSITORY,
  type IPublicPartnerRepository,
} from '../../domain/ports/public-partner-repository.port';
import { PublicPartnerNotFound } from '../../domain/errors/partner-errors';
import { toPublicPartnerProfileResponse } from '../partner.mapper';

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
    if (!partner) throw new PublicPartnerNotFound();
    return toPublicPartnerProfileResponse(partner);
  }
}
