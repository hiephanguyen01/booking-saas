import { Module, type OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../../../../shared/prisma/prisma.module';
import { TenantContextModule } from '../../../../shared/tenant-context/tenant-context.module';
import { OutboxHandlerRegistry } from '../../../../shared/outbox/outbox-handler.registry';
import { TenancyModule } from '../../../tenancy/infrastructure/http/tenancy.module';
import { PAYMENT_BOOKING_READER } from '../../domain/ports/payment-booking-reader.port';
import { CRYPTO } from '../../domain/ports/crypto.port';
import { PAYMENT_REPOSITORY } from '../../domain/ports/payment-repository.port';
import { REFUND_REPOSITORY } from '../../domain/ports/refund-repository.port';
import { GATEWAY_CONFIG_REPOSITORY } from '../../domain/ports/gateway-config-repository.port';
import { GATEWAY_REGISTRY } from '../../domain/ports/gateway-registry.port';
import { AesGcmCryptoService } from '../aes-gcm-crypto.service';
import { PrismaPaymentRepository } from '../repositories/prisma-payment.repository';
import { PrismaRefundRepository } from '../repositories/prisma-refund.repository';
import { PrismaGatewayConfigRepository } from '../repositories/prisma-gateway-config.repository';
import { PrismaPaymentBookingReader } from '../repositories/prisma-payment-booking.reader';
import { MockGatewayAdapter } from '../gateways/mock-gateway.adapter';
import { GatewayRegistry } from '../gateway-registry';
import { ReconciliationWorker } from '../reconciliation.worker';
import { CheckoutUseCase } from '../../application/use-cases/checkout.use-case';
import { HandleWebhookUseCase } from '../../application/use-cases/handle-webhook.use-case';
import { ExecuteRefundUseCase } from '../../application/use-cases/execute-refund.use-case';
import { GetPaymentStatusUseCase } from '../../application/use-cases/get-payment-status.use-case';
import { UpsertGatewayConfigUseCase } from '../../application/use-cases/upsert-gateway-config.use-case';
import { GetGatewayConfigUseCase } from '../../application/use-cases/get-gateway-config.use-case';
import { ListTenantPaymentsUseCase } from '../../application/use-cases/list-tenant-payments.use-case';
import { ListPlatformPaymentsUseCase } from '../../application/use-cases/list-platform-payments.use-case';
import { ConfirmManualRefundUseCase } from '../../application/use-cases/confirm-manual-refund.use-case';
import { ListTenantRefundsUseCase } from '../../application/use-cases/list-tenant-refunds.use-case';
import { UpdateGatewayPaymentSettingsUseCase } from '../../application/use-cases/update-gateway-payment-settings.use-case';
import { GetPublicPaymentOptionsUseCase } from '../../application/use-cases/get-public-payment-options.use-case';
import { ExecuteAutomaticRefundUseCase } from '../../application/use-cases/execute-automatic-refund.use-case';
import { PublicPaymentController } from './public-payment.controller';
import { WebhookController } from './webhook.controller';
import { TenantGatewayController } from './tenant-gateway.controller';
import { TenantPaymentController } from './tenant-payment.controller';
import { PlatformPaymentController } from './platform-payment.controller';

@Module({
  imports: [PrismaModule, TenantContextModule, TenancyModule],
  controllers: [
    PublicPaymentController,
    WebhookController,
    TenantGatewayController,
    TenantPaymentController,
    PlatformPaymentController,
  ],
  providers: [
    { provide: CRYPTO, useClass: AesGcmCryptoService },
    { provide: PAYMENT_REPOSITORY, useClass: PrismaPaymentRepository },
    { provide: PAYMENT_BOOKING_READER, useClass: PrismaPaymentBookingReader },
    { provide: REFUND_REPOSITORY, useClass: PrismaRefundRepository },
    { provide: GATEWAY_CONFIG_REPOSITORY, useClass: PrismaGatewayConfigRepository },
    MockGatewayAdapter,
    { provide: GATEWAY_REGISTRY, useClass: GatewayRegistry },
    ReconciliationWorker,
    CheckoutUseCase,
    HandleWebhookUseCase,
    ExecuteRefundUseCase,
    GetPaymentStatusUseCase,
    UpsertGatewayConfigUseCase,
    GetGatewayConfigUseCase,
    ListTenantPaymentsUseCase,
    ListPlatformPaymentsUseCase,
    ConfirmManualRefundUseCase,
    ListTenantRefundsUseCase,
    UpdateGatewayPaymentSettingsUseCase,
    GetPublicPaymentOptionsUseCase,
    ExecuteAutomaticRefundUseCase,
  ],
  exports: [ExecuteRefundUseCase],
})
export class PaymentsModule implements OnModuleInit {
  constructor(
    private readonly registry: OutboxHandlerRegistry,
    private readonly refunds: ExecuteRefundUseCase,
    private readonly automaticRefunds: ExecuteAutomaticRefundUseCase,
  ) {}

  onModuleInit(): void {
    this.registry.register('refund.execution_requested', (event) => {
      const p = event.payload as { refundId: string };
      return this.automaticRefunds.execute(event.tenantId ?? '', p.refundId);
    });
    // Execute refunds when a booking is cancelled (policy refund) or an inventory
    // rental is returned (deposit refund). Ledger entries are Task 1.10.
    this.registry.register('booking.cancelled', (event) => {
      const p = event.payload as { bookingId: string; refundAmount?: string };
      return this.refunds.execute(
        event.tenantId ?? '',
        p.bookingId,
        BigInt(p.refundAmount ?? '0'),
        'booking_cancellation',
      );
    });
    this.registry.register('booking.returned', (event) => {
      const p = event.payload as { bookingId: string; depositRefund?: string };
      return this.refunds.execute(
        event.tenantId ?? '',
        p.bookingId,
        BigInt(p.depositRefund ?? '0'),
        'security_deposit',
      );
    });
    this.registry.register('booking.no_show', (event) => {
      const p = event.payload as { bookingId: string; securityDeposit?: string };
      return this.refunds.execute(
        event.tenantId ?? '',
        p.bookingId,
        BigInt(p.securityDeposit ?? '0'),
        'security_deposit',
      );
    });
    this.registry.register('settlement.refund_requested', (event) => {
      const p = event.payload as {
        bookingId: string;
        amount: string;
        affectsBookingStatus: boolean;
      };
      return this.refunds.execute(
        event.tenantId ?? '',
        p.bookingId,
        BigInt(p.amount),
        'dispute_refund',
        p.affectsBookingStatus,
      );
    });
    this.registry.register('refund.recovery_requested', (event) => {
      const p = event.payload as { bookingId: string; amount: string; reason: string };
      return this.refunds.execute(event.tenantId ?? '', p.bookingId, BigInt(p.amount), p.reason);
    });
  }
}
