import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { OutboxHandlerRegistry } from '../../../../shared/outbox/outbox-handler.registry';
import { PrismaModule } from '../../../../shared/prisma/prisma.module';
import { TenantContextModule } from '../../../../shared/tenant-context/tenant-context.module';
import { BookingModule } from '../../../booking/infrastructure/http/booking.module';
import { TenancyModule } from '../../../tenancy/infrastructure/http/tenancy.module';
import { CheckoutUseCase } from '../../application/use-cases/checkout.use-case';
import { ConfirmManualRefundUseCase } from '../../application/use-cases/confirm-manual-refund.use-case';
import { DeactivateGatewayUseCase } from '../../application/use-cases/deactivate-gateway.use-case';
import { ExecuteAutomaticRefundUseCase } from '../../application/use-cases/execute-automatic-refund.use-case';
import { ExecuteRefundUseCase } from '../../application/use-cases/execute-refund.use-case';
import { GetGatewayConfigUseCase } from '../../application/use-cases/get-gateway-config.use-case';
import { GetPaymentStatusUseCase } from '../../application/use-cases/get-payment-status.use-case';
import { GetPublicPaymentOptionsUseCase } from '../../application/use-cases/get-public-payment-options.use-case';
import { HandleWebhookUseCase } from '../../application/use-cases/handle-webhook.use-case';
import { ListPlatformPaymentsUseCase } from '../../application/use-cases/list-platform-payments.use-case';
import { ListTenantPaymentsUseCase } from '../../application/use-cases/list-tenant-payments.use-case';
import { ListTenantRefundsUseCase } from '../../application/use-cases/list-tenant-refunds.use-case';
import { UpdateGatewayPaymentSettingsUseCase } from '../../application/use-cases/update-gateway-payment-settings.use-case';
import { UpsertGatewayConfigUseCase } from '../../application/use-cases/upsert-gateway-config.use-case';
import { CRYPTO } from '../../domain/ports/crypto.port';
import { GATEWAY_CONFIG_REPOSITORY } from '../../domain/ports/gateway-config-repository.port';
import { GATEWAY_REGISTRY } from '../../domain/ports/gateway-registry.port';
import { PAYMENT_BOOKING_READER } from '../../domain/ports/payment-booking-reader.port';
import { PAYMENT_REPOSITORY } from '../../domain/ports/payment-repository.port';
import { REFUND_REPOSITORY } from '../../domain/ports/refund-repository.port';
import { AesGcmCryptoService } from '../aes-gcm-crypto.service';
import { GatewayRegistry } from '../gateway-registry';
import { MockGatewayAdapter } from '../gateways/mock-gateway.adapter';
import { ReconciliationWorker } from '../reconciliation.worker';
import { PrismaGatewayConfigRepository } from '../repositories/prisma-gateway-config.repository';
import { PrismaPaymentBookingReader } from '../repositories/prisma-payment-booking.reader';
import { PrismaPaymentRepository } from '../repositories/prisma-payment.repository';
import { PrismaRefundRepository } from '../repositories/prisma-refund.repository';
import { PlatformPaymentController } from './platform-payment.controller';
import { PublicPaymentController } from './public-payment.controller';
import { TenantGatewayController } from './tenant-gateway.controller';
import { TenantPaymentController } from './tenant-payment.controller';
import { WebhookController } from './webhook.controller';

@Module({
  imports: [PrismaModule, TenantContextModule, TenancyModule, BookingModule],
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
    DeactivateGatewayUseCase,
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
  private readonly logger = new Logger(PaymentsModule.name);

  constructor(
    private readonly registry: OutboxHandlerRegistry,
    private readonly refunds: ExecuteRefundUseCase,
    private readonly automaticRefunds: ExecuteAutomaticRefundUseCase,
  ) {}

  onModuleInit(): void {
    this.registry.register('refund.execution_requested', (event) => {
      const tenantId = this.requireTenantId(event.eventType, event.tenantId);
      if (!tenantId) return Promise.resolve();
      const p = event.payload as { refundId: string };
      return this.automaticRefunds.execute(tenantId, p.refundId);
    });
    // Execute refunds when a booking is cancelled (policy refund) or an inventory
    // rental is returned (deposit refund). Ledger entries are Task 1.10.
    this.registry.register('booking.cancelled', (event) => {
      const tenantId = this.requireTenantId(event.eventType, event.tenantId);
      if (!tenantId) return Promise.resolve();
      const p = event.payload as { bookingId: string; refundAmount?: string };
      return this.refunds.execute(
        tenantId,
        p.bookingId,
        BigInt(p.refundAmount ?? '0'),
        'booking_cancellation',
      );
    });
    this.registry.register('booking.returned', (event) => {
      const tenantId = this.requireTenantId(event.eventType, event.tenantId);
      if (!tenantId) return Promise.resolve();
      const p = event.payload as { bookingId: string; depositRefund?: string };
      return this.refunds.execute(
        tenantId,
        p.bookingId,
        BigInt(p.depositRefund ?? '0'),
        'security_deposit',
      );
    });
    this.registry.register('booking.no_show', (event) => {
      const tenantId = this.requireTenantId(event.eventType, event.tenantId);
      if (!tenantId) return Promise.resolve();
      const p = event.payload as { bookingId: string; securityDeposit?: string };
      return this.refunds.execute(
        tenantId,
        p.bookingId,
        BigInt(p.securityDeposit ?? '0'),
        'security_deposit',
      );
    });
    this.registry.register('settlement.refund_requested', (event) => {
      const tenantId = this.requireTenantId(event.eventType, event.tenantId);
      if (!tenantId) return Promise.resolve();
      const p = event.payload as {
        bookingId: string;
        amount: string;
        affectsBookingStatus: boolean;
      };
      return this.refunds.execute(
        tenantId,
        p.bookingId,
        BigInt(p.amount),
        'dispute_refund',
        p.affectsBookingStatus,
      );
    });
    this.registry.register('refund.recovery_requested', (event) => {
      const tenantId = this.requireTenantId(event.eventType, event.tenantId);
      if (!tenantId) return Promise.resolve();
      const p = event.payload as { bookingId: string; amount: string; reason: string };
      return this.refunds.execute(tenantId, p.bookingId, BigInt(p.amount), p.reason);
    });
  }

  /**
   * A tenant-scoped payments event without a tenant id cannot be routed: skip it
   * (and say so) instead of running `forTenant('')`, which crashes on the RLS
   * policy's uuid cast. Skipping — not throwing — avoids wasting the event's
   * finite retry budget and eventually dead-lettering a structurally invalid row.
   */
  private requireTenantId(eventType: string, tenantId: string | null): string | null {
    if (tenantId) return tenantId;
    this.logger.warn(`skipping ${eventType}: outbox event has no tenantId`);
    return null;
  }
}
