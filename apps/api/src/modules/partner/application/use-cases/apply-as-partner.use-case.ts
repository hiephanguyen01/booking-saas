import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PartnerApplyInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../../tenancy/domain/ports/tenant-repository.port';
import { PlanLimitService } from '../../../tenancy/application/services/plan-limit.service';
import { ResolveAdministrativeAddressUseCase } from '../../../administrative-division/application/use-cases/resolve-administrative-address.use-case';
import {
  PARTNER_REPOSITORY,
  type IPartnerRepository,
  type PartnerRecord,
} from '../../domain/ports/partner-repository.port';
import { PARTNER_ROLES, type IPartnerRoles } from '../../domain/ports/partner-roles.port';

/**
 * A logged-in user applies to become a partner under a tenant (self-signup,
 * §7.3). The partner starts `pending` for tenant approval; the applicant becomes
 * a member with the Partner Owner role so they can complete their profile and
 * submit identity while waiting. Partner + member + role assignment + event
 * commit atomically inside one tenant transaction.
 */
@Injectable()
export class ApplyAsPartnerUseCase {
  constructor(
    @Inject(PARTNER_REPOSITORY) private readonly partners: IPartnerRepository,
    @Inject(PARTNER_ROLES) private readonly roles: IPartnerRoles,
    @Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository,
    private readonly planLimits: PlanLimitService,
    private readonly resolveAdministrativeAddress: ResolveAdministrativeAddressUseCase,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(userId: string, input: PartnerApplyInput): Promise<PartnerRecord> {
    const tenant = await this.tenants.findById(input.tenantId);
    if (!tenant) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'TENANT_NOT_FOUND',
        message: 'Tenant not found',
      });
    }
    if (tenant.status !== 'active') {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'TENANT_INACTIVE',
        message: 'Tenant is not accepting partner applications',
      });
    }

    const location = await this.resolveAdministrativeAddress.execute(
      input.contactInfo.provinceCode,
      input.contactInfo.wardCode,
    );

    // Hard plan limit (this route has no tenant context, so enforce here rather
    // than via PlanLimitGuard).
    await this.planLimits.assertCanAddPartner(input.tenantId);

    const ownerRoleId = await this.roles.partnerOwnerRoleId();

    const partner = await this.tenantDb.forTenant(input.tenantId, async (tx) => {
      if (await this.partners.findBySlug(tx, input.slug)) {
        throw new ConflictException({
          statusCode: 409,
          code: 'PARTNER_SLUG_TAKEN',
          message: `Slug "${input.slug}" is already in use`,
        });
      }
      const created = await this.partners.create(tx, input.tenantId, {
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        partnerType: input.partnerType,
        status: 'pending',
        businessInfo: input.businessInfo,
        contactInfo: {
          phone: input.contactInfo.phone,
          provinceCode: location.province.code,
          provinceName: location.province.name,
          provinceType: location.province.type,
          wardCode: location.ward.code,
          wardName: location.ward.name,
          wardType: location.ward.type,
          address: input.contactInfo.address,
        },
        payoutInfo: input.payoutInfo,
      });
      await this.partners.addMember(tx, {
        tenantId: input.tenantId,
        partnerId: created.id,
        userId,
      });
      await this.partners.assignRole(tx, {
        tenantId: input.tenantId,
        partnerId: created.id,
        userId,
        roleId: ownerRoleId,
      });
      await this.outbox.emit(tx, {
        tenantId: input.tenantId,
        eventType: 'partner.applied',
        payload: { partnerId: created.id, userId },
      });
      // `created` was read back before addMember ran, so its `owner` is still
      // null. Re-read so the applicant's own record carries the owner contact it
      // just established (the row is in this tx, so this always resolves).
      return (await this.partners.findById(tx, created.id)) ?? created;
    });

    // Evict the applicant's cached permissions so partner scope works immediately.
    await this.roles.invalidateUserPermissions(userId);
    return partner;
  }
}
