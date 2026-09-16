import { Inject, Injectable } from '@nestjs/common';
import type { PaymentStatusResponse } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import {
  PAYMENT_BOOKING_READER,
  type IPaymentBookingReader,
} from '../../domain/ports/payment-booking-reader.port';
import {
  PAYMENT_REPOSITORY,
  type IPaymentRepository,
} from '../../domain/ports/payment-repository.port';
import {
  GATEWAY_REGISTRY,
  type GatewayRegistryPort,
} from '../../domain/ports/gateway-registry.port';
import { amountMatches, publicPaymentStatus } from '../../domain/payment-status';
import { BookingNotFound } from '../../../../shared/domain/errors/booking-not-found';

/** Storefront polls payment status here — auto-reconciles pending attempts with gateway. */
@Injectable()
export class GetPaymentStatusUseCase {
  constructor(
    @Inject(PAYMENT_BOOKING_READER) private readonly bookings: IPaymentBookingReader,
    @Inject(PAYMENT_REPOSITORY) private readonly payments: IPaymentRepository,
    @Inject(GATEWAY_REGISTRY) private readonly registry: GatewayRegistryPort,
    private readonly resolveTenant: ResolveTenantByHostUseCase,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(host: string, code: string): Promise<PaymentStatusResponse> {
    const tenant = await this.resolveTenant.execute(host);

    const snapshot = await this.tenantDb.forTenant(tenant.id, async (tx) => {
      const booking = await this.bookings.findByCode(tx, code);
      if (!booking) throw new BookingNotFound();
      const payment = await this.payments.findLatestByBooking(tx, booking.id);
      if (!payment || payment.status !== 'pending') {
        return { booking, payment, shouldQueryGateway: false, gateway: null, reference: null };
      }
      const reference = payment.gatewayOrderRef ?? payment.gatewayTxnId;
      if (!reference) {
        return { booking, payment, shouldQueryGateway: false, gateway: null, reference: null };
      }
      try {
        const resolved = await this.registry.resolveForPayment(tx, payment);
        return {
          booking,
          payment,
          shouldQueryGateway: true,
          gateway: resolved.gateway,
          reference,
        };
      } catch {
        return { booking, payment, shouldQueryGateway: false, gateway: null, reference: null };
      }
    });

    let currentPaymentStatus = snapshot.payment?.status ?? null;
    let currentBookingStatus = snapshot.booking.status;

    if (snapshot.shouldQueryGateway && snapshot.gateway && snapshot.reference && snapshot.payment) {
      try {
        const gatewayStatus = await snapshot.gateway.queryPaymentStatus(snapshot.reference);
        if (
          gatewayStatus.status === 'succeeded' &&
          amountMatches(snapshot.payment.amount, gatewayStatus.amountVnd)
        ) {
          const paymentId = snapshot.payment.id;
          const bookingId = snapshot.booking.id;
          const flipped = await this.tenantDb.forTenant(tenant.id, async (tx) => {
            const succeeded = await this.payments.markSucceeded(
              tx,
              paymentId,
              { reconciled: true },
              {
                capturedAmount: gatewayStatus.amountVnd,
                gatewayTxnId: gatewayStatus.gatewayTxnId,
              },
            );
            if (succeeded) {
              await this.outbox.emit(tx, {
                tenantId: tenant.id,
                eventType: 'payment.succeeded',
                payload: { paymentId, bookingId },
              });
            }
            return succeeded;
          });

          if (flipped) {
            currentPaymentStatus = 'succeeded';
            currentBookingStatus = 'confirmed';
          }
        }
      } catch {
        // Proceed with current status if gateway lookup temporarily fails
      }
    }

    return {
      bookingCode: code,
      bookingStatus: currentBookingStatus,
      paymentStatus: publicPaymentStatus(currentPaymentStatus),
      paymentKind: snapshot.payment?.kind ?? null,
      paidAmount: snapshot.booking.paidAmount.toString(),
    };
  }
}
