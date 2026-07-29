import { Injectable } from '@nestjs/common';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  IAgreementRepository,
  PartnerAgreementRecord,
  RecordAgreementData,
} from '../../domain/ports/agreement-repository.port';

@Injectable()
export class PrismaAgreementRepository implements IAgreementRepository {
  async listByPartner(tx: PrismaTx, partnerId: string): Promise<PartnerAgreementRecord[]> {
    return tx.agreementAcceptance.findMany({
      where: { partnerId },
      select: { agreementType: true, version: true, acceptedAt: true },
      orderBy: { acceptedAt: 'desc' },
    });
  }

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
