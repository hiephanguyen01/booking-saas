import { Injectable } from '@nestjs/common';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { IBookingPartnerReader } from '../../domain/ports/booking-partner-reader.port';

@Injectable()
export class PrismaBookingPartnerReader implements IBookingPartnerReader {
  async isHouse(tx: PrismaTx, partnerId: string): Promise<boolean> {
    const partner = await tx.partner.findUnique({
      where: { id: partnerId },
      select: { isHouse: true },
    });
    return partner?.isHouse ?? false;
  }
}
