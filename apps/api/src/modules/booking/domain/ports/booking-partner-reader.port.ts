import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const BOOKING_PARTNER_READER = Symbol('BOOKING_PARTNER_READER');

export interface IBookingPartnerReader {
  isHouse(tx: PrismaTx, partnerId: string): Promise<boolean>;
}
