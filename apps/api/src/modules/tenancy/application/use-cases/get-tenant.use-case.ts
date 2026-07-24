import { Inject, Injectable } from '@nestjs/common';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
  type TenantRecord,
} from '../../domain/ports/tenant-repository.port';

@Injectable()
export class GetTenantUseCase {
  constructor(@Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository) {}

  async execute(id: string): Promise<TenantRecord> {
    const tenant = await this.tenants.findById(id);
    if (!tenant) {
      throw new TenantNotFound();
    }
    return tenant;
  }
}
