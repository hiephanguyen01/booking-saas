import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { TenantDbService } from '../../../shared/tenant-context/tenant-db.service';
import { utcNow } from '../../../shared/time/time';
import { ConfirmBookingUseCase } from '../../booking/application/use-cases/confirm-booking.use-case';
import { PAYMENT_REPOSITORY, type IPaymentRepository } from '../domain/ports/payment-repository.port';
import { amountMatches } from '../domain/payment-status';
import { GatewayRegistry } from './gateway-registry';

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
    private readonly registry: GatewayRegistry,
    private readonly confirmBooking: ConfirmBookingUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.OUTBOX_RELAY_DISABLED === 'true') return;
    const connection = { url: process.env.REDIS_URL ?? 'redis://localhost:6379' };
    this.queue = new Queue(RECONCILIATION_QUEUE, { connection });
    await this.queue.upsertJobScheduler('reconcile-poll', { every: POLL_EVERY_MS }, { name: 'poll' });
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
      if (!p.gatewayTxnId) continue;
      const txnId = p.gatewayTxnId;
      try {
        // Record the payment durably first (its own tx), then confirm — mirroring the
        // webhook path so the slot-taken auto-refund (§8.2 row 665) actually fires.
        const flipped = await this.tenantDb.forTenant(p.tenantId, async (tx) => {
          const gateway = await this.registry.resolveForTenant(tx, p.tenantId);
          const status = await gateway.queryPaymentStatus(txnId);
          if (status.status === 'expired') {
            // Guarded: only expire while still pending (a concurrent succeeded wins).
            await this.payments.markTerminalIfPending(tx, p.id, 'expired');
            return false;
          }
          if (status.status !== 'succeeded') return false;
          // Same amount guard as the webhook path (§11.2): an underpaid result must
          // not confirm — leave it pending for a human/next poll rather than settle.
          if (!amountMatches(p.amount, status.amountVnd)) {
            this.logger.warn(
              `reconcile ${p.id}: gateway reports succeeded but amount ${status.amountVnd} < expected ${p.amount}; leaving pending`,
            );
            return false;
          }
          return this.payments.markSucceeded(tx, p.id, utcNow(), { reconciled: true });
        });
        if (flipped) {
          reconciled++;
          // Own tx: execute() handles the expired→confirmed restore and auto-refunds
          // if the slot was taken. Absorbs SlotTaken; other errors are logged.
          try {
            await this.confirmBooking.execute(p.tenantId, p.bookingId);
          } catch (err) {
            this.logger.error(`reconcile ${p.id}: confirm after payment succeeded failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      } catch (err) {
        this.logger.debug(`reconcile ${p.id} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return reconciled;
  }
}
