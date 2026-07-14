import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AssignSubscriptionInput } from '@booking/contracts';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../domain/ports/tenant-repository.port';
import { PLAN_REPOSITORY, type IPlanRepository } from '../../domain/ports/plan-repository.port';
import {
  SUBSCRIPTION_REPOSITORY,
  type ISubscriptionRepository,
  type SubscriptionRecord,
} from '../../domain/ports/subscription-repository.port';

/**
 * Platform admin assigns a plan to a tenant (§3.1 — manual invoicing in Phase 1).
 * A new row supersedes the previous subscription (findCurrentByTenant reads the
 * latest by startsAt), preserving history.
 */
@Injectable()
export class AssignSubscriptionUseCase {
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository,
    @Inject(PLAN_REPOSITORY) private readonly plans: IPlanRepository,
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
  ) {}

  async execute(tenantId: string, input: AssignSubscriptionInput): Promise<SubscriptionRecord> {
    if (!(await this.tenants.findById(tenantId))) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'TENANT_NOT_FOUND',
        message: `Tenant ${tenantId} not found`,
      });
    }
    if (!(await this.plans.findById(input.planId))) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'PLAN_NOT_FOUND',
        message: `Plan ${input.planId} not found`,
      });
    }
    const startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
    const expiresAt = new Date(input.expiresAt);
    if (expiresAt <= startsAt) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_SUBSCRIPTION_PERIOD',
        message: 'expiresAt must be after startsAt',
      });
    }
    return this.subscriptions.create({
      tenantId,
      planId: input.planId,
      status: input.status,
      startsAt,
      expiresAt,
      note: input.note ?? null,
    });
  }
}
