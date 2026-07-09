import { Module, type OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../../../../shared/prisma/prisma.module';
import { TenantContextModule } from '../../../../shared/tenant-context/tenant-context.module';
import { OutboxHandlerRegistry } from '../../../../shared/outbox/outbox-handler.registry';
import { TenancyModule } from '../../../tenancy/infrastructure/http/tenancy.module';
import { BookingModule } from '../../../booking/infrastructure/http/booking.module';
import { CRYPTO } from '../../domain/ports/crypto.port';
import { PAYMENT_REPOSITORY } from '../../domain/ports/payment-repository.port';
import { REFUND_REPOSITORY } from '../../domain/ports/refund-repository.port';
import { GATEWAY_CONFIG_REPOSITORY } from '../../domain/ports/gateway-config-repository.port';
import { AesGcmCryptoService } from '../aes-gcm-crypto.service';
import { PrismaPaymentRepository } from '../repositories/prisma-payment.repository';
import { PrismaRefundRepository } from '../repositories/prisma-refund.repository';
import { PrismaGatewayConfigRepository } from '../repositories/prisma-gateway-config.repository';
import { MockGatewayAdapter } from '../gateways/mock-gateway.adapter';
import { GatewayRegistry } from '../gateway-registry';
import { ReconciliationWorker } from '../reconciliation.worker';
import { CheckoutUseCase } from '../../application/use-cases/checkout.use-case';
import { HandleWebhookUseCase } from '../../application/use-cases/handle-webhook.use-case';
import { ExecuteRefundUseCase } from '../../application/use-cases/execute-refund.use-case';
import { GetPaymentStatusUseCase } from '../../application/use-cases/get-payment-status.use-case';
import { UpsertGatewayConfigUseCase } from '../../application/use-cases/upsert-gateway-config.use-case';
import { PublicPaymentController } from './public-payment.controller';
import { WebhookController } from './webhook.controller';
import { TenantGatewayController } from './tenant-gateway.controller';

@Module({
  imports: [PrismaModule, TenantContextModule, TenancyModule, BookingModule],
  controllers: [PublicPaymentController, WebhookController, TenantGatewayController],
  providers: [
    { provide: CRYPTO, useClass: AesGcmCryptoService },
    { provide: PAYMENT_REPOSITORY, useClass: PrismaPaymentRepository },
    { provide: REFUND_REPOSITORY, useClass: PrismaRefundRepository },
    { provide: GATEWAY_CONFIG_REPOSITORY, useClass: PrismaGatewayConfigRepository },
    MockGatewayAdapter,
    GatewayRegistry,
    ReconciliationWorker,
    CheckoutUseCase,
    HandleWebhookUseCase,
    ExecuteRefundUseCase,
    GetPaymentStatusUseCase,
    UpsertGatewayConfigUseCase,
  ],
  exports: [ExecuteRefundUseCase],
})
export class PaymentsModule implements OnModuleInit {
  constructor(
    private readonly registry: OutboxHandlerRegistry,
    private readonly refunds: ExecuteRefundUseCase,
  ) {}

  onModuleInit(): void {
    // Execute refunds when a booking is cancelled (policy refund) or an inventory
    // rental is returned (deposit refund). Ledger entries are Task 1.10.
    this.registry.register('booking.cancelled', (event) => {
      const p = event.payload as { bookingId: string; refundAmount?: string };
      return this.refunds.handle(event.tenantId ?? '', p.bookingId, BigInt(p.refundAmount ?? '0'));
    });
    this.registry.register('booking.returned', (event) => {
      const p = event.payload as { bookingId: string; depositRefund?: string };
      return this.refunds.handle(event.tenantId ?? '', p.bookingId, BigInt(p.depositRefund ?? '0'));
    });
  }
}
