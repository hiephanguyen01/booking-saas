import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  RESOURCE_REPOSITORY,
  type IResourceRepository,
  type ResourceRecord,
} from '../../domain/ports/resource-repository.port';

@Injectable()
export class ListResourcesUseCase {
  constructor(
    @Inject(RESOURCE_REPOSITORY) private readonly repo: IResourceRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string): Promise<ResourceRecord[]> {
    return this.tenantDb.forTenant(tenantId, (tx) => this.repo.list(tx));
  }
}
