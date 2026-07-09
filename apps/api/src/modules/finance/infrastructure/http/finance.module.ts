import { Module, type OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../../../../shared/prisma/prisma.module';
import { TenantContextModule } from '../../../../shared/tenant-context/tenant-context.module';
import { OutboxHandlerRegistry } from '../../../../shared/outbox/outbox-handler.registry';
import { TenancyModule } from '../../../tenancy/infrastructure/http/tenancy.module';
import { COMMISSION_RULE_REPOSITORY } from '../../domain/ports/commission-rule-repository.port';
import { LEDGER_REPOSITORY } from '../../domain/ports/ledger-repository.port';
import { PAYOUT_REPOSITORY } from '../../domain/ports/payout-repository.port';
import { PrismaCommissionRuleRepository } from '../repositories/prisma-commission-rule.repository';
import { PrismaLedgerRepository } from '../repositories/prisma-ledger.repository';
import { PrismaPayoutRepository } from '../repositories/prisma-payout.repository';
import { ResolveCommissionService } from '../../application/resolve-commission.service';
import { RecordJournalService } from '../../application/record-journal.service';
import { ListCommissionRulesUseCase } from '../../application/use-cases/list-commission-rules.use-case';
import { CreateCommissionRuleUseCase } from '../../application/use-cases/create-commission-rule.use-case';
import { UpdateCommissionRuleUseCase } from '../../application/use-cases/update-commission-rule.use-case';
import { DeleteCommissionRuleUseCase } from '../../application/use-cases/delete-commission-rule.use-case';
import { SetPlatformRateUseCase } from '../../application/use-cases/set-platform-rate.use-case';
import { ListPayoutsUseCase } from '../../application/use-cases/list-payouts.use-case';
import { CreatePayoutUseCase } from '../../application/use-cases/create-payout.use-case';
import { MarkPayoutPaidUseCase } from '../../application/use-cases/mark-payout-paid.use-case';
import { FailPayoutUseCase } from '../../application/use-cases/fail-payout.use-case';
import { GetTenantFinanceSummaryUseCase } from '../../application/use-cases/get-tenant-finance-summary.use-case';
import { GetPartnerFinanceUseCase } from '../../application/use-cases/get-partner-finance.use-case';
import { GetPlatformFinanceUseCase } from '../../application/use-cases/get-platform-finance.use-case';
import { TenantFinanceController } from './tenant-finance.controller';
import { PartnerFinanceController } from './partner-finance.controller';
import { PlatformFinanceController } from './platform-finance.controller';

@Module({
  imports: [PrismaModule, TenantContextModule, TenancyModule],
  controllers: [TenantFinanceController, PartnerFinanceController, PlatformFinanceController],
  providers: [
    { provide: COMMISSION_RULE_REPOSITORY, useClass: PrismaCommissionRuleRepository },
    { provide: LEDGER_REPOSITORY, useClass: PrismaLedgerRepository },
    { provide: PAYOUT_REPOSITORY, useClass: PrismaPayoutRepository },
    ResolveCommissionService,
    RecordJournalService,
    ListCommissionRulesUseCase,
    CreateCommissionRuleUseCase,
    UpdateCommissionRuleUseCase,
    DeleteCommissionRuleUseCase,
    SetPlatformRateUseCase,
    ListPayoutsUseCase,
    CreatePayoutUseCase,
    MarkPayoutPaidUseCase,
    FailPayoutUseCase,
    GetTenantFinanceSummaryUseCase,
    GetPartnerFinanceUseCase,
    GetPlatformFinanceUseCase,
  ],
  // Exported so the booking module can snapshot the commission at booking time.
  exports: [ResolveCommissionService],
})
export class FinanceModule implements OnModuleInit {
  constructor(
    private readonly registry: OutboxHandlerRegistry,
    private readonly journals: RecordJournalService,
  ) {}

  /**
   * Ledger journals are driven purely by booking lifecycle events (§13.1). Every
   * handler is idempotent (guarded on existing ledger entries) so at-least-once
   * outbox delivery is safe:
   *   completed → commission journal; no_show → journal on paid_amount;
   *   cancelled → cancellation_fee on the retained portion;
   *   refunded (post-completion dispute) → clawback reversal.
   */
  onModuleInit(): void {
    this.registry.register('booking.completed', (event) =>
      this.journals.recordCompletion(event.tenantId ?? '', bookingIdOf(event.payload)),
    );
    this.registry.register('booking.no_show', (event) =>
      this.journals.recordNoShow(event.tenantId ?? '', bookingIdOf(event.payload)),
    );
    this.registry.register('booking.cancelled', (event) => {
      const p = event.payload as { bookingId: string; refundAmount?: string };
      return this.journals.recordCancellationFee(event.tenantId ?? '', p.bookingId, BigInt(p.refundAmount ?? '0'));
    });
    this.registry.register('booking.refunded', (event) =>
      this.journals.recordClawback(event.tenantId ?? '', bookingIdOf(event.payload)),
    );
  }
}

function bookingIdOf(payload: unknown): string {
  return (payload as { bookingId: string }).bookingId;
}
