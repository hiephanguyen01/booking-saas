import type { AvailabilityExceptionType, AvailabilityWindow } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const AVAILABILITY_EXCEPTION_REPOSITORY = Symbol('AVAILABILITY_EXCEPTION_REPOSITORY');

export interface AvailabilityExceptionRecord {
  id: string;
  resourceId: string;
  date: string; // YYYY-MM-DD
  type: AvailabilityExceptionType;
  /** Every opening window of the day; empty when `closed`. Authoritative. */
  windows: AvailabilityWindow[];
  /** Mirror of `windows[0]`, kept for readers predating the `windows` column. */
  openTime: string | null;
  closeTime: string | null;
  reason: string | null;
}

export interface AvailabilityExceptionInputData {
  date: string;
  type: AvailabilityExceptionType;
  /** Preferred. Falls back to the `openTime`/`closeTime` pair when absent. */
  windows?: AvailabilityWindow[];
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
  /** Drop every exception in an inclusive date span; returns how many went. */
  deleteInRange(tx: PrismaTx, resourceId: string, from: string, to: string): Promise<number>;
  findById(tx: PrismaTx, id: string): Promise<AvailabilityExceptionRecord | null>;
}
