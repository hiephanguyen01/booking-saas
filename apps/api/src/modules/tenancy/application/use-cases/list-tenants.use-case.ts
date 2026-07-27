import { Inject, Injectable } from '@nestjs/common';
import type { ListTenantsQuery } from '@booking/contracts';
import type { RepoPage } from '../../../../shared/pagination/pagination';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
  type TenantRecord,
} from '../../domain/ports/tenant-repository.port';

@Injectable()
export class ListTenantsUseCase {
  constructor(@Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository) {}

  async execute(query: ListTenantsQuery): Promise<RepoPage<TenantRecord>> {
    return this.tenants.list({
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      status: query.status,
      vertical: query.vertical,
    });
  }
}
