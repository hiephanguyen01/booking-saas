import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { NewResource } from '../entities/resource.entity';

export const RESOURCE_REPOSITORY = Symbol('RESOURCE_REPOSITORY');

export interface ResourceRecord {
  id: string;
  tenantId: string;
  partnerId: string;
  name: string;
  timezone: string;
  createdAt: Date;
}

export interface IResourceRepository {
  create(tx: PrismaTx, tenantId: string, data: NewResource): Promise<ResourceRecord>;
  findById(tx: PrismaTx, id: string): Promise<ResourceRecord | null>;
  list(tx: PrismaTx): Promise<ResourceRecord[]>;
}
