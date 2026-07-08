export const TENANT_DOMAIN_REPOSITORY = Symbol('TENANT_DOMAIN_REPOSITORY');

export interface DomainRecord {
  id: string;
  tenantId: string;
  hostname: string;
  isPrimary: boolean;
  verificationToken: string | null;
  verifiedAt: Date | null;
}

export interface CreateDomainData {
  tenantId: string;
  hostname: string;
  isPrimary: boolean;
  verificationToken: string | null;
  verifiedAt: Date | null;
}

export interface ITenantDomainRepository {
  create(data: CreateDomainData): Promise<DomainRecord>;
  findByHostname(hostname: string): Promise<DomainRecord | null>;
  findById(id: string): Promise<DomainRecord | null>;
  listByTenant(tenantId: string): Promise<DomainRecord[]>;
  markVerified(id: string): Promise<DomainRecord>;
}
