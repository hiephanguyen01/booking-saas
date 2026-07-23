import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  PARTNER_READER,
  type IPartnerReader,
  type PartnerRecord,
} from '../../domain/ports/partner-reader.port';

@Injectable()
export class GetPartnerUseCase {
  constructor(
    @Inject(PARTNER_READER) private readonly partners: IPartnerReader,
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
