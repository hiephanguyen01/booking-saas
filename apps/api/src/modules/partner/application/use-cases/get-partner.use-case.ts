import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  PARTNER_REPOSITORY,
  type IPartnerRepository,
  type PartnerRecord,
} from '../../domain/ports/partner-repository.port';

@Injectable()
export class GetPartnerUseCase {
  constructor(
    @Inject(PARTNER_REPOSITORY) private readonly partners: IPartnerRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, partnerId: string): Promise<PartnerRecord> {
    const partner = await this.tenantDb.forTenant(tenantId, (tx) =>
      this.partners.findById(tx, partnerId),
    );
    if (!partner) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'PARTNER_NOT_FOUND',
        message: 'Partner not found',
      });
    }
    return partner;
  }
}
