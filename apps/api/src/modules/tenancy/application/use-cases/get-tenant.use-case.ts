import { Inject, Injectable, NotFoundException } from '@nestjs/common';
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
      throw new NotFoundException({
        statusCode: 404,
        code: 'TENANT_NOT_FOUND',
        message: `Tenant ${id} not found`,
      });
    }
    return tenant;
  }
}
