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

/**
 * Recovers lost webhooks (§11.2): polls the gateway for pending payments stuck
 * too long and applies the result. DB-polled like the outbox relay; the atomic
 * markSucceeded keeps it idempotent with a late webhook.
 */
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
      const queryStartedAt = Date.now();
      try {
        // Decrypt/configure the adapter in a short RLS transaction, then release
        // the DB connection before the provider network call.
        const gateway = await this.tenantDb.forTenant(p.tenantId, (tx) =>
          this.registry.resolveForTenant(tx, p.tenantId, p.gateway),
        );
        const status = await gateway.queryPaymentStatus(reference);
        if (p.gateway === 'momo') {
          this.logger.debug(
            `momo reconcile queried tenant=${p.tenantId} payment=${p.id} ref=${reference} status=${status.status} latencyMs=${Date.now() - queryStartedAt}`,
          );
        }

        // Record the provider result durably in its own short transaction.
        const flipped = await this.tenantDb.forTenant(p.tenantId, async (tx) => {
          if (status.status === 'expired') {
            // Guarded: only expire while still pending (a concurrent succeeded wins).
            await this.payments.markTerminalIfPending(tx, p.id, 'expired');
            if (p.gateway === 'momo') {
              this.logger.log(
                `momo reconcile terminal tenant=${p.tenantId} payment=${p.id} ref=${reference} status=expired`,
              );
            }
            return false;
          }
          if (status.status === 'failed' && gateway.reconcileFailedAsTerminal === true) {
            // Only gateways that explicitly opt in may turn a queried final failure
            // into a terminal payment. Existing gateways keep their old semantics.
            await this.payments.markTerminalIfPending(tx, p.id, 'failed');
            if (p.gateway === 'momo') {
              this.logger.log(
                `momo reconcile terminal tenant=${p.tenantId} payment=${p.id} ref=${reference} status=failed`,
              );
            }
            return false;
          }
          if (status.status !== 'succeeded') return false;
          // Same amount guard as the webhook path (§11.2): an underpaid result must
          // not confirm — leave it pending for a human/next poll rather than settle.
          if (!amountMatches(p.amount, status.amountVnd)) {
            this.logger.warn(
              `reconcile ${p.id}: gateway=${p.gateway} ref=${reference} reports succeeded but amount ${status.amountVnd} < expected ${p.amount}; leaving pending`,
            );
            return false;
          }
          const succeeded = await this.payments.markSucceeded(
            tx,
            p.id,
            { reconciled: true },
            // Persist the provider txn id when the status query exposes it (MoMo),
            // so a payment recovered without an IPN stays refundable.
            status.gatewayTxnId ? { gatewayTxnId: status.gatewayTxnId } : undefined,
          );
          if (succeeded) {
            await this.outbox.emit(tx, {
              tenantId: p.tenantId,
              eventType: 'payment.succeeded',
              payload: { paymentId: p.id, bookingId: p.bookingId },
            });
            if (p.gateway === 'momo') {
              this.logger.log(
                `momo reconcile succeeded tenant=${p.tenantId} payment=${p.id} ref=${reference} txnId=${status.gatewayTxnId ?? 'unknown'}`,
              );
            }
          } else if (p.gateway === 'momo') {
            this.logger.debug(
              `momo reconcile duplicate tenant=${p.tenantId} payment=${p.id} ref=${reference}`,
            );
          }
          return succeeded;
        });
        if (flipped) reconciled++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (p.gateway === 'momo') {
          this.logger.warn(
            `momo reconcile failed tenant=${p.tenantId} payment=${p.id} ref=${reference} latencyMs=${Date.now() - queryStartedAt}: ${message}`,
          );
        } else {
          this.logger.debug(`reconcile ${p.id} failed: ${message}`);
        }
      }
    }

    // Backstop both old already-processed events and partial consumer failures.
    // Re-emitting is safe because Booking confirmation and Settlement creation are
    // guarded/idempotent; the row drops out as soon as both projections converge.
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

    // Provider/manual refund truth can also outlive a failed consumer delivery.
    // Re-emit the durable refund row until both the booking and custody projection
    // converge; downstream handlers are guarded by refund id/state.
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

    // Cancellation stores its exact policy result before emitting the outbox
    // event. A no-show always returns the security deposit. If either refund
    // row is missing, request execution again without replaying unrelated
    // booking notifications.
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
