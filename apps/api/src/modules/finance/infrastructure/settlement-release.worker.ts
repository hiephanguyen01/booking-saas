import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import {
  SETTLEMENT_REPOSITORY,
  type ISettlementRepository,
} from '../domain/ports/settlement-repository.port';
import { ReleaseSettlementUseCase } from '../application/use-cases/release-settlement.use-case';

export const SETTLEMENT_RELEASE_QUEUE = 'settlement-release';
const POLL_EVERY_MS = 30_000;

/** Release due, undisputed settlements. Row/status guards keep concurrent sweeps idempotent. */
@Injectable()
export class SettlementReleaseWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(SettlementReleaseWorker.name);
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(SETTLEMENT_REPOSITORY) private readonly settlements: ISettlementRepository,
    private readonly releaseSettlement: ReleaseSettlementUseCase,
  ) {}

  async onModuleInit(): Promise<void> {
    if (
      process.env.SETTLEMENT_RELEASE_DISABLED === 'true' ||
      process.env.OUTBOX_RELAY_DISABLED === 'true'
    )
      return;
    const connection = { url: process.env.REDIS_URL ?? 'redis://localhost:6379' };
    this.queue = new Queue(SETTLEMENT_RELEASE_QUEUE, { connection });
    await this.queue.upsertJobScheduler(
      'settlement-release-poll',
      { every: POLL_EVERY_MS },
      { name: 'poll' },
    );
    this.worker = new Worker(SETTLEMENT_RELEASE_QUEUE, () => this.sweep(), { connection });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  async sweep(): Promise<number> {
    const due = await this.settlements.findDue(100);
    let released = 0;
    for (const item of due) {
      try {
        await this.releaseSettlement.execute(item.tenantId, item.id);
        released++;
      } catch (error) {
        this.logger.debug(
          `settlement ${item.id} release skipped: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return released;
  }
}
