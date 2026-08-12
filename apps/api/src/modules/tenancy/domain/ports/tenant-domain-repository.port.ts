import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { TenantHostKind } from './tenant-cache.port';

export const TENANT_DOMAIN_REPOSITORY = Symbol('TENANT_DOMAIN_REPOSITORY');

export interface DomainRecord {
  id: string;
  tenantId: string;
  hostname: string;
  isPrimary: boolean;
  kind: TenantHostKind;
  verificationToken: string | null;
  verifiedAt: Date | null;
}

export interface CreateDomainData {
  tenantId: string;
  hostname: string;
  isPrimary: boolean;
  kind: TenantHostKind;
  verificationToken: string | null;
  verifiedAt: Date | null;
}

export interface ITenantDomainRepository {
  create(data: CreateDomainData, tx?: PrismaTx): Promise<DomainRecord>;
  findByHostname(hostname: string): Promise<DomainRecord | null>;
  findById(id: string, tx?: PrismaTx): Promise<DomainRecord | null>;
  listByTenant(tenantId: string): Promise<DomainRecord[]>;
  listByTenantAndKind(tenantId: string, kind: TenantHostKind): Promise<DomainRecord[]>;
  markVerified(id: string): Promise<DomainRecord>;
  /** Atomically make one domain primary and clear the previous primary. */
  setPrimary(tenantId: string, id: string, tx: PrismaTx): Promise<DomainRecord>;
  delete(id: string): Promise<void>;
}
