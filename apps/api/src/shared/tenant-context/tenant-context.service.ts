import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContextStore {
  tenantId?: string;
  partnerId?: string;
}

/**
 * Request-scoped tenant context (TONG-QUAN.md §6.4). The middleware opens an
 * empty store per request; the auth layer fills in the resolved scope — the
 * tenant is derived from the login session's role assignments, never trusted
 * from a client-supplied tenant_id.
 */
@Injectable()
export class TenantContextService {
  private readonly als = new AsyncLocalStorage<TenantContextStore>();

  /** Wrap a unit of work (request, job, webhook handler) in a fresh store. */
  run<T>(store: TenantContextStore, fn: () => T): T {
    return this.als.run(store, fn);
  }

  setTenantId(tenantId: string): void {
    const store = this.als.getStore();
    if (store) store.tenantId = tenantId;
  }

  setPartnerId(partnerId: string): void {
    const store = this.als.getStore();
    if (store) store.partnerId = partnerId;
  }

  tenantId(): string | undefined {
    return this.als.getStore()?.tenantId;
  }

  tenantIdOrThrow(): string {
    const tenantId = this.tenantId();
    if (!tenantId) {
      throw new InternalServerErrorException('No tenant in context for a tenant-scoped operation');
    }
    return tenantId;
  }

  partnerId(): string | undefined {
    return this.als.getStore()?.partnerId;
  }

  partnerIdOrThrow(): string {
    const partnerId = this.partnerId();
    if (!partnerId) {
      throw new InternalServerErrorException('No partner in context for a partner-scoped operation');
    }
    return partnerId;
  }
}
