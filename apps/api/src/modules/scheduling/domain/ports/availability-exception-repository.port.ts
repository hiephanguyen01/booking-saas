import type { AvailabilityExceptionType } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const AVAILABILITY_EXCEPTION_REPOSITORY = Symbol('AVAILABILITY_EXCEPTION_REPOSITORY');

export interface AvailabilityExceptionRecord {
  id: string;
  resourceId: string;
  date: string; // YYYY-MM-DD
  type: AvailabilityExceptionType;
  openTime: string | null;
  closeTime: string | null;
  reason: string | null;
}

export interface AvailabilityExceptionInputData {
  date: string;
  type: AvailabilityExceptionType;
  openTime?: string | null;
  closeTime?: string | null;
  reason?: string | null;
}

export interface IAvailabilityExceptionRepository {
  listByResource(
    tx: PrismaTx,
    resourceId: string,
    fromDate: string,
    toDate: string,
  ): Promise<AvailabilityExceptionRecord[]>;
  create(
    tx: PrismaTx,
    tenantId: string,
    resourceId: string,
    data: AvailabilityExceptionInputData,
  ): Promise<AvailabilityExceptionRecord>;
  delete(tx: PrismaTx, id: string): Promise<void>;
  findById(tx: PrismaTx, id: string): Promise<AvailabilityExceptionRecord | null>;
}
