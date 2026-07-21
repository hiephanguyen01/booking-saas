import type { PartnerType, PublicPartnerListingType } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const PUBLIC_PARTNER_REPOSITORY = Symbol('PUBLIC_PARTNER_REPOSITORY');

export interface PublicPartnerRecord {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  partnerType: PartnerType;
  verifiedAt: Date | null;
  createdAt: Date;
  publishedOfferings: number;
  completedBookings: number;
  ratingAvg: number | null;
  reviewCount: number;
  listingTypes: PublicPartnerListingType[];
}

export interface IPublicPartnerRepository {
  findProfile(tx: PrismaTx, slug: string): Promise<PublicPartnerRecord | null>;
}
