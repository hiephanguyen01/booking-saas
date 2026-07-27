import { Injectable } from '@nestjs/common';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  IPromoAgreementRecorder,
  PromoFundingAgreement,
} from '../../domain/ports/promo-agreement-recorder.port';

@Injectable()
export class PrismaPromoAgreementRecorder implements IPromoAgreementRecorder {
  async record(tx: PrismaTx, agreement: PromoFundingAgreement): Promise<void> {
    await tx.agreementAcceptance.create({
      data: {
        tenantId: agreement.tenantId,
        partnerId: agreement.partnerId,
        userId: agreement.userId,
        agreementType: 'promo_funding',
        version: agreement.promotionId,
        ip: agreement.ip,
      },
    });
  }
}
