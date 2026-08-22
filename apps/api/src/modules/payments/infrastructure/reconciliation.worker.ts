import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { QUEUE_OPTIONS } from '../../../shared/redis/queue-options';
import { TenantDbService } from '../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../shared/outbox/outbox.service';
import {
  PAYMENT_REPOSITORY,
  type IPaymentRepository,
} from '../domain/ports/payment-repository.port';
import { GATEWAY_REGISTRY, type GatewayRegistryPort } from '../domain/ports/gateway-registry.port';
import { amountMatches } from '../domain/payment-status';
import { REFUND_REPOSITORY, type IRefundRepository } from '../domain/ports/refund-repository.port';

export const RECONCILIATION_QUEUE = 'payment-reconciliation';
const POLL_EVERY_MS = 30_000;
const staleSec = (): number => Number(process.env.PAYMENT_STALE_SEC ?? '600');

@Injectable()
export class ReconciliationWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(ReconciliationWorker.name);
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly payments: IPaymentRepository,
    @Inject(GATEWAY_REGISTRY) private readonly registry: GatewayRegistryPort,
    @Inject(REFUND_REPOSITORY) private readonly refunds: IRefundRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.OUTBOX_RELAY_DISABLED === 'true') return;
    const connection = { url: process.env.REDIS_URL ?? 'redis://localhost:6379' };
    this.queue = new Queue(RECONCILIATION_QUEUE, { connection, ...QUEUE_OPTIONS });
    await this.queue.upsertJobScheduler(
      'reconcile-poll',
      { every: POLL_EVERY_MS },
      { name: 'poll' },
    );
    this.worker = new Worker(RECONCILIATION_QUEUE, () => this.sweep(), { connection });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  async sweep(): Promise<number> {
    const stale = await this.payments.findStalePending(staleSec());
    let reconciled = 0;
    for (const p of stale) {
      const reference = p.gatewayOrderRef ?? p.gatewayTxnId;
      if (!reference) continue;
      try {
        const resolved = await this.tenantDb.forTenant(p.tenantId, (tx) =>
          this.registry.resolveForPayment(tx, p),
        );
        const status = await resolved.gateway.queryPaymentStatus(reference);

        const flipped = await this.tenantDb.forTenant(p.tenantId, async (tx) => {
          if (status.status === 'expired') {
            await this.payments.markTerminalIfPending(tx, p.id, 'expired');
            return false;
          }
          if (status.status !== 'succeeded') return false;
          if (!amountMatches(p.amount, status.amountVnd)) {
            await this.payments.recordCapturedAmountIfPending(tx, p.id, status.amountVnd);
            this.logger.warn(
              `payment_amount_mismatch paymentId=${p.id} gateway=${p.gateway} expected=${p.amount} captured=${status.amountVnd} source=reconciliation`,
            );
            return false;
          }
          const succeeded = await this.payments.markSucceeded(
            tx,
            p.id,
            { reconciled: true },
            {
              capturedAmount: status.amountVnd,
              gatewayTxnId: status.gatewayTxnId,
            },
          );
          if (succeeded) {
            await this.outbox.emit(tx, {
              tenantId: p.tenantId,
              eventType: 'payment.succeeded',
              payload: { paymentId: p.id, bookingId: p.bookingId },
            });
          }
          return succeeded;
        });
        if (flipped) reconciled++;
      } catch (err) {
        this.logger.debug(
          `reconcile ${p.id} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const recoverable = await this.payments.findSucceededNeedingRecovery(100);
    for (const p of recoverable) {
      try {
        await this.tenantDb.forTenant(p.tenantId, async (tx) => {
          await this.outbox.emit(tx, {
            tenantId: p.tenantId,
            eventType: 'payment.succeeded',
            payload: {
              paymentId: p.id,
              bookingId: p.bookingId,
              recovery: true,
              skipBookingConfirmation: p.skipBookingConfirmation === true,
            },
          });
        });
        reconciled++;
      } catch (err) {
        this.logger.debug(
          `recovery emit ${p.id} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const refundRecoveries = await this.refunds.findSucceededNeedingRecovery(100);
    for (const refund of refundRecoveries) {
      try {
        await this.tenantDb.forTenant(refund.tenantId, async (tx) => {
          await this.outbox.emit(tx, {
            tenantId: refund.tenantId,
            eventType: 'refund.completed',
            payload: {
              refundId: refund.id,
              paymentId: refund.paymentId,
              bookingId: refund.bookingId,
              amount: refund.amount.toString(),
              reason: refund.reason,
              affectsBookingStatus: refund.affectsBookingStatus,
              recovery: true,
            },
          });
        });
        reconciled++;
      } catch (err) {
        this.logger.debug(
          `refund recovery emit ${refund.id} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const missingRefunds = await this.refunds.findBookingsMissingRefund(100);
    for (const missing of missingRefunds) {
      try {
        await this.tenantDb.forTenant(missing.tenantId, async (tx) => {
          await this.outbox.emit(tx, {
            tenantId: missing.tenantId,
            eventType: 'refund.recovery_requested',
            payload: {
              bookingId: missing.bookingId,
              amount: missing.amount.toString(),
              reason: missing.reason,
              refundPercent: missing.refundPercent,
            },
          });
        });
        reconciled++;
      } catch (err) {
        this.logger.debug(
          `missing refund recovery ${missing.bookingId} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return reconciled;
  }
}
