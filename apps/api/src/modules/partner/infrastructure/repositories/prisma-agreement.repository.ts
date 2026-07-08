import { Injectable } from '@nestjs/common';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  IAgreementRepository,
  RecordAgreementData,
} from '../../domain/ports/agreement-repository.port';

@Injectable()
export class PrismaAgreementRepository implements IAgreementRepository {
  async record(tx: PrismaTx, data: RecordAgreementData): Promise<void> {
    await tx.agreementAcceptance.create({
      data: {
        tenantId: data.tenantId,
        partnerId: data.partnerId,
        userId: data.userId ?? null,
        agreementType: data.agreementType,
        version: data.version,
        ip: data.ip ?? null,
      },
    });
  }
}
