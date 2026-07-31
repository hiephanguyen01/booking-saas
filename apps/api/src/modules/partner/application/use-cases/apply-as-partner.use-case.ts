import { Inject, Injectable } from '@nestjs/common';
import type { PartnerApplyInput } from '@booking/contracts';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../../tenancy/domain/ports/tenant-repository.port';
import { AssertCanAddPartnerUseCase } from '../../../tenancy/application/use-cases/assert-can-add-partner.use-case';
import { ResolveAdministrativeAddressUseCase } from '../../../administrative-division/application/use-cases/resolve-administrative-address.use-case';
import {
  PARTNER_REPOSITORY,
  type IPartnerRepository,
  type PartnerRecord,
} from '../../domain/ports/partner-repository.port';
import { PARTNER_ROLES, type IPartnerRoles } from '../../domain/ports/partner-roles.port';
import { Partner } from '../../domain/entities/partner.entity';
import { RecordLegalAcceptanceUseCase } from '../../../legal/application/use-cases/record-legal-acceptance.use-case';

export interface ApplyContext {
  ip?: string | null;
}

/**
 * A logged-in user applies to become a partner under a tenant (self-signup,
 * §7.3). The partner starts `pending` for tenant approval; the applicant becomes
 * a member with the Partner Owner role so they can complete their profile and
 * submit identity while waiting. The applicant's real consent (partner terms +
 * customer terms + privacy policy, per D6) is recorded via `legal`'s
 * `RecordLegalAcceptanceUseCase` in the same transaction — there is no state
 * where a partner exists without their own signature. Partner + member + role
 * assignment + legal acceptance + event commit atomically inside one tenant
 * transaction.
 */
@Injectable()
export class ApplyAsPartnerUseCase {
  constructor(
    @Inject(PARTNER_REPOSITORY) private readonly partners: IPartnerRepository,
    @Inject(PARTNER_ROLES) private readonly roles: IPartnerRoles,
    @Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository,
    private readonly assertCanAddPartner: AssertCanAddPartnerUseCase,
    private readonly resolveAdministrativeAddress: ResolveAdministrativeAddressUseCase,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
    private readonly recordLegalAcceptance: RecordLegalAcceptanceUseCase,
  ) {}

  async execute(
    userId: string,
    input: PartnerApplyInput,
    ctx: ApplyContext,
  ): Promise<PartnerRecord> {
    const tenant = await this.tenants.findById(input.tenantId);
    if (!tenant) throw new TenantNotFound();
    Partner.assertTenantAcceptingApplications(tenant.status);

    const location = await this.resolveAdministrativeAddress.execute(
      input.contactInfo.provinceCode,
      input.contactInfo.wardCode,
    );

    // Hard plan limit (this route has no tenant context, so enforce here rather
    // than via PlanLimitGuard).
    await this.assertCanAddPartner.execute(input.tenantId);

    const ownerRoleId = await this.roles.partnerOwnerRoleId();

    const partner = await this.tenantDb.forTenant(input.tenantId, async (tx) => {
      const slugTaken = Boolean(await this.partners.findBySlug(tx, input.slug));
      Partner.assertSlugAvailable(input.slug, slugTaken);

      const newPartner = Partner.apply({
        tenantId: input.tenantId,
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        partnerType: input.partnerType,
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
      const created = await this.partners.create(tx, newPartner);
      await this.recordLegalAcceptance.execute(tx, {
        tenantId: input.tenantId,
        userId,
        partnerId: created.id,
        acceptedVersionIds: input.legalConsent.acceptedVersionIds,
        acceptedLocale: input.legalConsent.acceptedLocale,
        ip: ctx.ip,
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
