import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../../../../shared/prisma/prisma.module';
import { TenantContextModule } from '../../../../shared/tenant-context/tenant-context.module';
import { OutboxHandlerRegistry } from '../../../../shared/outbox/outbox-handler.registry';
import { TenancyModule } from '../../../tenancy/infrastructure/http/tenancy.module';
import { COMMISSION_RULE_REPOSITORY } from '../../domain/ports/commission-rule-repository.port';
import { LEDGER_REPOSITORY } from '../../domain/ports/ledger-repository.port';
import { PAYOUT_REPOSITORY } from '../../domain/ports/payout-repository.port';
import { SETTLEMENT_REPOSITORY } from '../../domain/ports/settlement-repository.port';
import { SETTLEMENT_DISPUTE_REPOSITORY } from '../../domain/ports/settlement-dispute-repository.port';
import { FINANCE_TENANT_HOST_READER } from '../../domain/ports/finance-tenant-host-reader.port';
import { PAYOUT_POLICY_STORE } from '../../domain/ports/payout-policy-store.port';
import { PLATFORM_FINANCE_READER } from '../../domain/ports/platform-finance-reader.port';
import { PrismaCommissionRuleRepository } from '../repositories/prisma-commission-rule.repository';
import { PrismaLedgerRepository } from '../repositories/prisma-ledger.repository';
import { PrismaPayoutRepository } from '../repositories/prisma-payout.repository';
import { PrismaSettlementRepository } from '../repositories/prisma-settlement.repository';
import { PrismaSettlementDisputeRepository } from '../repositories/prisma-settlement-dispute.repository';
import { PrismaFinanceTenantHostReader } from '../repositories/prisma-finance-tenant-host.reader';
import { PrismaPayoutPolicyStore } from '../repositories/prisma-payout-policy.store';
import { PrismaPlatformFinanceReader } from '../repositories/prisma-platform-finance.reader';
import { ResolveCommissionUseCase } from '../../application/use-cases/resolve-commission.use-case';
import { RecordClawbackJournalUseCase } from '../../application/use-cases/record-clawback-journal.use-case';
import { ComputePayoutPayableUseCase } from '../../application/use-cases/compute-payout-payable.use-case';
import { ListCommissionRulesUseCase } from '../../application/use-cases/list-commission-rules.use-case';
import { CreateCommissionRuleUseCase } from '../../application/use-cases/create-commission-rule.use-case';
import { UpdateCommissionRuleUseCase } from '../../application/use-cases/update-commission-rule.use-case';
import { DeleteCommissionRuleUseCase } from '../../application/use-cases/delete-commission-rule.use-case';
import { ListPayoutsUseCase } from '../../application/use-cases/list-payouts.use-case';
import { CreatePayoutUseCase } from '../../application/use-cases/create-payout.use-case';
import { MarkPayoutPaidUseCase } from '../../application/use-cases/mark-payout-paid.use-case';
import { FailPayoutUseCase } from '../../application/use-cases/fail-payout.use-case';
import { GetTenantFinanceSummaryUseCase } from '../../application/use-cases/get-tenant-finance-summary.use-case';
import { GetPartnerFinanceUseCase } from '../../application/use-cases/get-partner-finance.use-case';
import { ListPartnerLedgerUseCase } from '../../application/use-cases/list-partner-ledger.use-case';
import { GetPlatformFinanceUseCase } from '../../application/use-cases/get-platform-finance.use-case';
import { GetTenantPayableUseCase } from '../../application/use-cases/get-tenant-payable.use-case';
import { ListPartnerPayoutsUseCase } from '../../application/use-cases/list-partner-payouts.use-case';
import { ListTenantLedgerUseCase } from '../../application/use-cases/list-tenant-ledger.use-case';
import { GetBookingSettlementUseCase } from '../../application/use-cases/get-booking-settlement.use-case';
import { GetPayoutPolicyUseCase } from '../../application/use-cases/get-payout-policy.use-case';
import { ListBookingSettlementsUseCase } from '../../application/use-cases/list-booking-settlements.use-case';
import { RecordHeldSettlementUseCase } from '../../application/use-cases/record-held-settlement.use-case';
import { ReleaseSettlementUseCase } from '../../application/use-cases/release-settlement.use-case';
import { StartSettlementWindowUseCase } from '../../application/use-cases/start-settlement-window.use-case';
import { StartNoShowSettlementWindowUseCase } from '../../application/use-cases/start-no-show-settlement-window.use-case';
import { PrepareSettlementRefundUseCase } from '../../application/use-cases/prepare-settlement-refund.use-case';
import { FinalizeSettlementRefundUseCase } from '../../application/use-cases/finalize-settlement-refund.use-case';
import { OpenSettlementDisputeUseCase } from '../../application/use-cases/open-settlement-dispute.use-case';
import { ResolveSettlementDisputeUseCase } from '../../application/use-cases/resolve-settlement-dispute.use-case';
import { ListSettlementDisputesUseCase } from '../../application/use-cases/list-settlement-disputes.use-case';
import { ListPlatformDisputesUseCase } from '../../application/use-cases/list-platform-disputes.use-case';
import { GetSettlementSummaryUseCase } from '../../application/use-cases/get-settlement-summary.use-case';
import { ListPlatformSettlementsUseCase } from '../../application/use-cases/list-platform-settlements.use-case';
import { GetTenantPayoutPolicyUseCase } from '../../application/use-cases/get-tenant-payout-policy.use-case';
import { UpdatePayoutPolicyUseCase } from '../../application/use-cases/update-payout-policy.use-case';
import { GetCustomerBookingSettlementUseCase } from '../../application/use-cases/get-customer-booking-settlement.use-case';
import { RespondSettlementDisputeUseCase } from '../../application/use-cases/respond-settlement-dispute.use-case';
import { SettlementReleaseWorker } from '../settlement-release.worker';
import { TenantFinanceController } from './tenant-finance.controller';
import { PartnerFinanceController } from './partner-finance.controller';
import { PlatformFinanceController } from './platform-finance.controller';
import { CustomerFinanceController } from './customer-finance.controller';
import { TenantDisputeController } from './tenant-dispute.controller';

@Module({
  imports: [PrismaModule, TenantContextModule, TenancyModule],
  controllers: [
    TenantFinanceController,
    PartnerFinanceController,
    PlatformFinanceController,
    CustomerFinanceController,
    TenantDisputeController,
  ],
  providers: [
    { provide: COMMISSION_RULE_REPOSITORY, useClass: PrismaCommissionRuleRepository },
    { provide: LEDGER_REPOSITORY, useClass: PrismaLedgerRepository },
    { provide: PAYOUT_REPOSITORY, useClass: PrismaPayoutRepository },
    { provide: SETTLEMENT_REPOSITORY, useClass: PrismaSettlementRepository },
    {
      provide: SETTLEMENT_DISPUTE_REPOSITORY,
      useClass: PrismaSettlementDisputeRepository,
    },
    { provide: FINANCE_TENANT_HOST_READER, useClass: PrismaFinanceTenantHostReader },
    { provide: PAYOUT_POLICY_STORE, useClass: PrismaPayoutPolicyStore },
    { provide: PLATFORM_FINANCE_READER, useClass: PrismaPlatformFinanceReader },
    ResolveCommissionUseCase,
    RecordClawbackJournalUseCase,
    ComputePayoutPayableUseCase,
    ListCommissionRulesUseCase,
    CreateCommissionRuleUseCase,
    UpdateCommissionRuleUseCase,
    DeleteCommissionRuleUseCase,
    ListPayoutsUseCase,
    CreatePayoutUseCase,
    MarkPayoutPaidUseCase,
    FailPayoutUseCase,
    GetTenantFinanceSummaryUseCase,
    GetPartnerFinanceUseCase,
    ListPartnerLedgerUseCase,
    GetPlatformFinanceUseCase,
    GetTenantPayableUseCase,
    ListPartnerPayoutsUseCase,
    ListTenantLedgerUseCase,
    GetBookingSettlementUseCase,
    GetPayoutPolicyUseCase,
    ListBookingSettlementsUseCase,
    RecordHeldSettlementUseCase,
    ReleaseSettlementUseCase,
    StartSettlementWindowUseCase,
    StartNoShowSettlementWindowUseCase,
    PrepareSettlementRefundUseCase,
    FinalizeSettlementRefundUseCase,
    OpenSettlementDisputeUseCase,
    ResolveSettlementDisputeUseCase,
    ListSettlementDisputesUseCase,
    ListPlatformDisputesUseCase,
    GetSettlementSummaryUseCase,
    ListPlatformSettlementsUseCase,
    GetTenantPayoutPolicyUseCase,
    UpdatePayoutPolicyUseCase,
    GetCustomerBookingSettlementUseCase,
    RespondSettlementDisputeUseCase,
    SettlementReleaseWorker,
  ],
  // Exported so the booking module can snapshot the commission at booking time.
  exports: [ResolveCommissionUseCase],
})
export class FinanceModule implements OnModuleInit {
  private readonly logger = new Logger(FinanceModule.name);

  constructor(
    private readonly registry: OutboxHandlerRegistry,
    private readonly recordHeldSettlement: RecordHeldSettlementUseCase,
    private readonly startSettlementWindow: StartSettlementWindowUseCase,
    private readonly startNoShowWindow: StartNoShowSettlementWindowUseCase,
    private readonly prepareRefund: PrepareSettlementRefundUseCase,
    private readonly finalizeRefund: FinalizeSettlementRefundUseCase,
    private readonly clawbackJournal: RecordClawbackJournalUseCase,
    private readonly releaseSettlement: ReleaseSettlementUseCase,
  ) {}

  /**
   * Payment success creates the custody record. Completion opens (but does not
   * recognize revenue during) the dispute window. A worker creates the revenue
   * journal only after that deadline. All handlers are idempotent for at-least-once
   * outbox delivery:
   *   payment succeeded → held; completed/no_show → dispute window;
   *   cancelled → refund pending or a cancellation-fee dispute window;
   *   refunded (post-completion dispute) → clawback reversal.
   */
  onModuleInit(): void {
    this.registry.register('payment.succeeded', (event) => {
      const payload = event.payload as { paymentId: string };
      const tenantId = this.requireTenantId(event.eventType, event.tenantId);
      if (!tenantId) return Promise.resolve();
      return this.recordHeldSettlement.execute(tenantId, payload.paymentId);
    });
    this.registry.register('booking.completed', (event) => {
      const payload = event.payload as { bookingId: string; onsiteCollectedAmount?: string };
      const tenantId = this.requireTenantId(event.eventType, event.tenantId);
      if (!tenantId) return Promise.resolve();
      return this.startSettlementWindow.execute(
        tenantId,
        payload.bookingId,
        payload.onsiteCollectedAmount === undefined
          ? undefined
          : BigInt(payload.onsiteCollectedAmount),
      );
    });
    this.registry.register('booking.no_show', (event) => {
      const tenantId = this.requireTenantId(event.eventType, event.tenantId);
      if (!tenantId) return Promise.resolve();
      return this.startNoShowWindow.execute(tenantId, bookingIdOf(event.payload));
    });
    this.registry.register('booking.cancelled', (event) => {
      const p = event.payload as { bookingId: string; refundAmount?: string };
      const tenantId = this.requireTenantId(event.eventType, event.tenantId);
      if (!tenantId) return Promise.resolve();
      return this.prepareRefund.execute(
        tenantId,
        p.bookingId,
        BigInt(p.refundAmount ?? '0'),
        'cancellation_fee',
      );
    });
    this.registry.register('refund.requested', (event) => {
      const p = event.payload as {
        bookingId: string;
        amount: string;
        reason?: string;
        affectsBookingStatus?: boolean;
      };
      if (p.affectsBookingStatus === false) return Promise.resolve();
      const tenantId = this.requireTenantId(event.eventType, event.tenantId);
      if (!tenantId) return Promise.resolve();
      return this.prepareRefund.execute(
        tenantId,
        p.bookingId,
        BigInt(p.amount),
        p.reason === 'booking_cancellation' ? 'cancellation_fee' : undefined,
        p.reason === 'dispute_refund',
      );
    });
    this.registry.register('refund.completed', async (event) => {
      const p = event.payload as {
        refundId: string;
        bookingId: string;
        amount: string;
        reason?: string | null;
        affectsBookingStatus?: boolean;
      };
      if (p.affectsBookingStatus === false) return;
      const tenantId = this.requireTenantId(event.eventType, event.tenantId);
      if (!tenantId) return;
      await this.finalizeRefund.execute(
        tenantId,
        p.bookingId,
        p.refundId,
        BigInt(p.amount),
        p.reason,
      );
      await this.clawbackJournal.execute(tenantId, p.bookingId);
    });
    this.registry.register('booking.refunded', (event) => {
      const tenantId = this.requireTenantId(event.eventType, event.tenantId);
      if (!tenantId) return Promise.resolve();
      return this.clawbackJournal.execute(tenantId, bookingIdOf(event.payload));
    });
    this.registry.register('settlement.release_requested', (event) => {
      const p = event.payload as { settlementId: string };
      const tenantId = this.requireTenantId(event.eventType, event.tenantId);
      if (!tenantId) return Promise.resolve();
      return this.releaseSettlement.execute(tenantId, p.settlementId);
    });
  }

  /**
   * Finance handlers always open an RLS transaction. An unroutable event must be
   * logged and skipped instead of passing an empty string to the tenant UUID GUC.
   */
  private requireTenantId(eventType: string, tenantId: string | null): string | null {
    if (tenantId) return tenantId;
    this.logger.warn(`skipping ${eventType}: outbox event has no tenantId`);
    return null;
  }
}

function bookingIdOf(payload: unknown): string {
  return (payload as { bookingId: string }).bookingId;
}
