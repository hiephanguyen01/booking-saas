import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { QUEUE_OPTIONS } from '../../../shared/redis/queue-options';
import { MANUAL_REFUND_OPERATION_REPOSITORY, type IManualRefundOperationRepository } from '../domain/ports/manual-refund-operation-repository.port';
import { EscalateManualRefundCheckerWaitingUseCase } from '../application/use-cases/escalate-manual-refund-checker-waiting.use-case';
import { SendManualRefundCustomerDetailReminderUseCase } from '../application/use-cases/send-manual-refund-customer-detail-reminder.use-case';
import { StartManualRefundTransferSlaUseCase } from '../application/use-cases/start-manual-refund-transfer-sla.use-case';
import { PurgeManualRefundCiphertextUseCase } from '../application/use-cases/purge-manual-refund-ciphertext.use-case';

export const MANUAL_REFUND_SLA_QUEUE = 'manual-refund-sla';
const POLL_EVERY_MS = 5 * 60_000;
const BATCH_SIZE = 100;

/** Admin-polled orchestration for timer work; each mutation re-enters tenant RLS. */
@Injectable()
export class ManualRefundSlaWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(ManualRefundSlaWorker.name);
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(MANUAL_REFUND_OPERATION_REPOSITORY) private readonly operations: IManualRefundOperationRepository,
    private readonly detailReminder: SendManualRefundCustomerDetailReminderUseCase,
    private readonly transferSla: StartManualRefundTransferSlaUseCase,
    private readonly checkerEscalation: EscalateManualRefundCheckerWaitingUseCase,
    private readonly purgeCiphertext: PurgeManualRefundCiphertextUseCase,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.OUTBOX_RELAY_DISABLED === 'true') return;
    const connection = { url: process.env.REDIS_URL ?? 'redis://localhost:6379' };
    this.queue = new Queue(MANUAL_REFUND_SLA_QUEUE, { connection, ...QUEUE_OPTIONS });
    await this.queue.upsertJobScheduler('manual-refund-sla-poll', { every: POLL_EVERY_MS }, { name: 'poll' });
    this.worker = new Worker(MANUAL_REFUND_SLA_QUEUE, () => this.sweep(), { connection });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  async sweep(): Promise<number> {
    let processed = 0;
    const reminders = await this.operations.findCustomerDetailReminderCandidates(BATCH_SIZE);
    for (const candidate of reminders) {
      try { if (await this.detailReminder.execute(candidate.tenantId, candidate.operationId, candidate.hours)) processed++; }
      catch (error) { this.logger.debug(`manual refund reminder failed: ${error instanceof Error ? error.message : String(error)}`); }
    }
    const transfer = await this.operations.findTransferSlaCandidates(BATCH_SIZE);
    for (const candidate of transfer) {
      try { if (await this.transferSla.execute(candidate.tenantId, candidate.operationId, candidate.slaHours)) processed++; }
      catch (error) { this.logger.debug(`manual refund transfer SLA failed: ${error instanceof Error ? error.message : String(error)}`); }
    }
    const checker = await this.operations.findCheckerEscalationCandidates(BATCH_SIZE);
    for (const candidate of checker) {
      try { if (await this.checkerEscalation.execute(candidate.tenantId, candidate.operationId)) processed++; }
      catch (error) { this.logger.debug(`manual refund checker escalation failed: ${error instanceof Error ? error.message : String(error)}`); }
    }
    const purge = await this.operations.findCiphertextPurgeCandidates(BATCH_SIZE);
    for (const candidate of purge) {
      try { if (await this.purgeCiphertext.execute(candidate.tenantId, candidate.operationId)) processed++; }
      catch (error) { this.logger.debug(`manual refund ciphertext purge failed: ${error instanceof Error ? error.message : String(error)}`); }
    }
    return processed;
  }
}
