import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { OutboxHandlerRegistry } from '../../../../shared/outbox/outbox-handler.registry';
import { PrismaModule } from '../../../../shared/prisma/prisma.module';
import { TenantContextModule } from '../../../../shared/tenant-context/tenant-context.module';
import { IdentityAccessModule } from '../../../identity-access/infrastructure/http/identity-access.module';
import { TenancyModule } from '../../../tenancy/infrastructure/http/tenancy.module';
import {
  AGREEMENT_ACCEPTANCE_REPOSITORY,
} from '../../domain/ports/agreement-acceptance-repository.port';
import { LEGAL_DOCUMENT_REPOSITORY } from '../../domain/ports/legal-document-repository.port';
import { PrismaAgreementAcceptanceRepository } from '../repositories/prisma-agreement-acceptance.repository';
import { PrismaLegalDocumentRepository } from '../repositories/prisma-legal-document.repository';
import { GetPublicLegalDocumentUseCase } from '../../application/use-cases/get-public-legal-document.use-case';
import { GetTenantLegalUseCase } from '../../application/use-cases/get-tenant-legal.use-case';
import { ListMyAcceptancesUseCase } from '../../application/use-cases/list-my-acceptances.use-case';
import { ListPartnerAcceptancesUseCase } from '../../application/use-cases/list-partner-acceptances.use-case';
import { ListPendingAcceptancesUseCase } from '../../application/use-cases/list-pending-acceptances.use-case';
import { ListPublicLegalDocumentsUseCase } from '../../application/use-cases/list-public-legal-documents.use-case';
import { PublishLegalDocumentUseCase } from '../../application/use-cases/publish-legal-document.use-case';
import { RecordLegalAcceptanceUseCase } from '../../application/use-cases/record-legal-acceptance.use-case';
import { RecordRegistrationConsentUseCase } from '../../application/use-cases/record-registration-consent.use-case';
import { ResolveLegalCallerScopeUseCase } from '../../application/use-cases/resolve-legal-caller-scope.use-case';
import { SaveLegalDraftUseCase } from '../../application/use-cases/save-legal-draft.use-case';
import { SeedTenantLegalDraftsUseCase } from '../../application/use-cases/seed-tenant-legal-drafts.use-case';
import { WithdrawLegalDocumentUseCase } from '../../application/use-cases/withdraw-legal-document.use-case';
import { RequireCurrentAgreementGuard } from './guards/require-current-agreement.guard';
import { MeLegalController } from './me-legal.controller';
import { PublicLegalController } from './public-legal.controller';
import { TenantLegalController } from './tenant-legal.controller';

@Module({
  // OutboxModule and TenantContextModule are @Global(), so only TenancyModule
  // (RequireActiveSubscriptionGuard + ResolveTenantByHostUseCase +
  // TENANT_REPOSITORY) and IdentityAccessModule (PERMISSION_RESOLVER, which
  // ResolveLegalCallerScopeUseCase uses to verify the scope headers the
  // dashboard names) need importing here. Both edges already exist at file
  // level — legal has always imported identity-access's guards/decorators —
  // so no new edge appears in the graph the module-cycle guard walks.
  imports: [PrismaModule, TenantContextModule, TenancyModule, IdentityAccessModule],
  controllers: [TenantLegalController, PublicLegalController, MeLegalController],
  providers: [
    PrismaLegalDocumentRepository,
    { provide: LEGAL_DOCUMENT_REPOSITORY, useExisting: PrismaLegalDocumentRepository },
    PrismaAgreementAcceptanceRepository,
    { provide: AGREEMENT_ACCEPTANCE_REPOSITORY, useExisting: PrismaAgreementAcceptanceRepository },
    GetTenantLegalUseCase,
    SaveLegalDraftUseCase,
    PublishLegalDocumentUseCase,
    WithdrawLegalDocumentUseCase,
    GetPublicLegalDocumentUseCase,
    ListPublicLegalDocumentsUseCase,
    SeedTenantLegalDraftsUseCase,
    RecordLegalAcceptanceUseCase,
    ListPendingAcceptancesUseCase,
    ListMyAcceptancesUseCase,
    ListPartnerAcceptancesUseCase,
    RecordRegistrationConsentUseCase,
    ResolveLegalCallerScopeUseCase,
    RequireCurrentAgreementGuard,
  ],
  // Injected by partner/affiliate/booking. AGENTS.md sanctions importing another
  // module's guard, or its use-case/repository port **for a synchronous read**;
  // a write-path side effect normally crosses via the outbox. The consent write
  // is a deliberate, spec-mandated exception, not a general allowance: the
  // design requires the acceptance row to commit in the SAME transaction as the
  // action it authorizes ("a partner that exists without a signature is not a
  // state the database can reach"), which at-least-once async delivery cannot
  // give. Crossings that do NOT need that atomicity still go through the outbox
  // — hence tenant.created / user.registration_consent below.
  exports: [
    AGREEMENT_ACCEPTANCE_REPOSITORY,
    LEGAL_DOCUMENT_REPOSITORY,
    RecordLegalAcceptanceUseCase,
    ListPendingAcceptancesUseCase,
    ListPartnerAcceptancesUseCase,
    RequireCurrentAgreementGuard,
  ],
})
export class LegalModule implements OnModuleInit {
  private readonly logger = new Logger(LegalModule.name);

  constructor(
    private readonly registry: OutboxHandlerRegistry,
    private readonly recordRegistrationConsent: RecordRegistrationConsentUseCase,
    private readonly seedTenantLegalDrafts: SeedTenantLegalDraftsUseCase,
  ) {}

  onModuleInit(): void {
    // D5: identity-access cannot import legal (cycle: legal already depends on
    // identity-access's guards/decorators), so registration consent arrives as
    // an event. Registering the handler here creates no import edge.
    this.registry.register('user.registration_consent', (event) => {
      if (!event.tenantId) return Promise.resolve();
      return this.recordRegistrationConsent.execute(event.tenantId, event.payload as never);
    });

    // D10: tenancy cannot call SeedTenantLegalDraftsUseCase directly either —
    // legal already imports tenancy (TENANT_REPOSITORY, ResolveTenantByHostUseCase,
    // RequireActiveSubscriptionGuard), so a tenancy -> legal call back would close
    // the exact cycle the module-cycle guard exists to catch. CreateTenantUseCase
    // already emits `tenant.created` unconditionally; seeding the four drafts here,
    // async, is harmless — a brand-new tenant is dark until its owner publishes
    // regardless of whether the drafts exist yet.
    this.registry.register('tenant.created', (event) => {
      const tenantId = this.requireTenantId(event.eventType, event.tenantId);
      if (!tenantId) return Promise.resolve();
      return this.seedTenantLegalDrafts.execute(tenantId);
    });
  }

  private requireTenantId(eventType: string, tenantId: string | null): string | null {
    if (tenantId) return tenantId;
    this.logger.warn(`skipping ${eventType}: outbox event has no tenantId`);
    return null;
  }
}
