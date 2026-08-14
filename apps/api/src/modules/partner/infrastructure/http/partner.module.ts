import { Module, type OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../../../../shared/prisma/prisma.module';
import { TenantContextModule } from '../../../../shared/tenant-context/tenant-context.module';
import { IdentityAccessModule } from '../../../identity-access/infrastructure/http/identity-access.module';
import { TenancyModule } from '../../../tenancy/infrastructure/http/tenancy.module';
import { AdministrativeDivisionModule } from '../../../administrative-division/infrastructure/http/administrative-division.module';
import { LegalModule } from '../../../legal/infrastructure/http/legal.module';
import { PARTNER_READER } from '../../domain/ports/partner-reader.port';
import { PARTNER_REPOSITORY } from '../../domain/ports/partner-repository.port';
import { PARTNER_TAX_REPOSITORY } from '../../domain/ports/partner-tax-repository.port';
import { OutboxHandlerRegistry } from '../../../../shared/outbox/outbox-handler.registry';
import { PARTNER_ROLES } from '../../domain/ports/partner-roles.port';
import { PARTNER_STAFF_REPOSITORY } from '../../domain/ports/partner-staff-repository.port';
import { PARTNER_MEMBERSHIP_WRITER } from '../../../identity-access/domain/ports/partner-membership-writer.port';
import { PrismaPartnerRepository } from '../repositories/prisma-partner.repository';
import { PrismaPartnerTaxRepository } from '../repositories/prisma-partner-tax.repository';
import { PrismaPartnerStaffRepository } from '../repositories/prisma-partner-staff.repository';
import { PrismaPartnerRoles } from '../services/prisma-partner-roles';
import { PartnerMembershipWriterAdapter } from '../services/partner-membership-writer.adapter';
import { ApplyAsPartnerUseCase } from '../../application/use-cases/apply-as-partner.use-case';
import { CreateHousePartnerUseCase } from '../../application/use-cases/create-house-partner.use-case';
import { ApprovePartnerUseCase } from '../../application/use-cases/approve-partner.use-case';
import { SubmitIdentityUseCase } from '../../application/use-cases/submit-identity.use-case';
import { VerifyIdentityUseCase } from '../../application/use-cases/verify-identity.use-case';
import { UpdatePayoutInfoUseCase } from '../../application/use-cases/update-payout-info.use-case';
import { UpdatePartnerDocumentsUseCase } from '../../application/use-cases/update-partner-documents.use-case';
import { SuspendPartnerUseCase } from '../../application/use-cases/suspend-partner.use-case';
import { UpdatePartnerTaxStatusUseCase } from '../../application/use-cases/update-partner-tax-status.use-case';
import { GetPartnerTaxAssessmentUseCase } from '../../application/use-cases/get-partner-tax-assessment.use-case';
import { RecordPartnerTaxDeclarationUseCase } from '../../application/use-cases/record-partner-tax-declaration.use-case';
import { RecordPartnerTaxRevenueUseCase } from '../../application/use-cases/record-partner-tax-revenue.use-case';
import { ReassessPartnerTaxThresholdUseCase } from '../../application/use-cases/reassess-partner-tax-threshold.use-case';
import { PartnerTaxReassessmentWorker } from '../partner-tax-reassessment.worker';
import { ListPartnersUseCase } from '../../application/use-cases/list-partners.use-case';
import { GetPartnerUseCase } from '../../application/use-cases/get-partner.use-case';
import { GetPartnerProfileUseCase } from '../../application/use-cases/get-partner-profile.use-case';
import { SetPartnerDefaultCancellationPolicyUseCase } from '../../application/use-cases/set-partner-default-cancellation-policy.use-case';
import { PartnerApplicationController } from './partner-application.controller';
import { TenantPartnerController } from './tenant-partner.controller';
import { PartnerProfileController } from './partner-profile.controller';
import { PUBLIC_PARTNER_REPOSITORY } from '../../domain/ports/public-partner-repository.port';
import { PrismaPublicPartnerRepository } from '../repositories/prisma-public-partner.repository';
import { GetPublicPartnerProfileUseCase } from '../../application/use-cases/get-public-partner-profile.use-case';
import { PublicPartnerController } from './public-partner.controller';

@Module({
  imports: [
    PrismaModule,
    TenantContextModule,
    IdentityAccessModule,
    TenancyModule,
    AdministrativeDivisionModule,
    LegalModule,
  ],
  controllers: [
    PartnerApplicationController,
    TenantPartnerController,
    PartnerProfileController,
    PublicPartnerController,
  ],
  providers: [
    PrismaPartnerRepository,
    { provide: PARTNER_REPOSITORY, useExisting: PrismaPartnerRepository },
    { provide: PARTNER_READER, useExisting: PrismaPartnerRepository },
    { provide: PARTNER_TAX_REPOSITORY, useClass: PrismaPartnerTaxRepository },
    { provide: PARTNER_ROLES, useClass: PrismaPartnerRoles },
    { provide: PARTNER_STAFF_REPOSITORY, useClass: PrismaPartnerStaffRepository },
    { provide: PARTNER_MEMBERSHIP_WRITER, useClass: PartnerMembershipWriterAdapter },
    { provide: PUBLIC_PARTNER_REPOSITORY, useClass: PrismaPublicPartnerRepository },
    ApplyAsPartnerUseCase,
    CreateHousePartnerUseCase,
    ApprovePartnerUseCase,
    SubmitIdentityUseCase,
    VerifyIdentityUseCase,
    UpdatePayoutInfoUseCase,
    UpdatePartnerDocumentsUseCase,
    SuspendPartnerUseCase,
    UpdatePartnerTaxStatusUseCase,
    GetPartnerTaxAssessmentUseCase,
    RecordPartnerTaxDeclarationUseCase,
    RecordPartnerTaxRevenueUseCase,
    ReassessPartnerTaxThresholdUseCase,
    PartnerTaxReassessmentWorker,
    ListPartnersUseCase,
    GetPartnerUseCase,
    GetPartnerProfileUseCase,
    SetPartnerDefaultCancellationPolicyUseCase,
    GetPublicPartnerProfileUseCase,
  ],
  // PARTNER_REPOSITORY exported so Task 1.4 (listing creation) reads the partner's
  // verification status. The identity-verification gate itself is a plain function
  // (application/assert-can-serve-listing-type.ts), imported directly.
  // PARTNER_MEMBERSHIP_WRITER exported so identity-access's shared accept-invitation
  // flow (Task 4) can materialise a PARTNER membership through this module without
  // reaching into `partner_members` itself. Not injected anywhere yet in this task —
  // Task 4 wires the consumer side, so an unused-export lint warning here is expected.
  exports: [PARTNER_REPOSITORY, PARTNER_MEMBERSHIP_WRITER],
})
export class PartnerModule implements OnModuleInit {
  constructor(
    private readonly registry: OutboxHandlerRegistry,
    private readonly recordTaxRevenue: RecordPartnerTaxRevenueUseCase,
  ) {}

  onModuleInit(): void {
    this.registry.register('finance.partner_revenue_recognized', (event) => {
      if (!event.tenantId) return Promise.resolve();
      const payload = event.payload as {
        partnerId: string;
        journalId: string;
        amount: string;
        serviceDate: string;
        bookingId: string;
      };
      return this.recordTaxRevenue.execute(event.tenantId, {
        partnerId: payload.partnerId,
        sourceType: 'settlement_release',
        sourceId: payload.journalId,
        amount: BigInt(payload.amount),
        serviceDate: new Date(payload.serviceDate),
        bookingId: payload.bookingId,
      });
    });
    this.registry.register('finance.partner_revenue_reversed', (event) => {
      if (!event.tenantId) return Promise.resolve();
      const payload = event.payload as {
        partnerId: string;
        journalId: string;
        reversesJournalId: string;
        serviceDate: string;
        bookingId: string;
      };
      return this.recordTaxRevenue.execute(event.tenantId, {
        partnerId: payload.partnerId,
        sourceType: 'settlement_clawback',
        sourceId: payload.journalId,
        reversesSourceId: payload.reversesJournalId,
        serviceDate: new Date(payload.serviceDate),
        bookingId: payload.bookingId,
      });
    });
  }
}
