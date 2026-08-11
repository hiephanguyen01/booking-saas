import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { QUEUE_OPTIONS } from '../../../shared/redis/queue-options';
import { TenantDbService } from '../../../shared/tenant-context/tenant-db.service';
import { STORAGE_PORT, type StoragePort } from '../../storage/domain/ports/storage.port';
import {
  TAX_DOCUMENT_CLEANUP_REPOSITORY,
  type ITaxDocumentCleanupRepository,
} from '../domain/ports/tax-document-cleanup-repository.port';

export const TAX_DOCUMENT_CLEANUP_QUEUE = 'tax-document-cleanup';
const POLL_EVERY_MS = 60 * 60_000;

/** Deletes only expired, never-attached staging PDFs. Issued artifacts are immutable. */
@Injectable()
export class TaxDocumentCleanupWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(TaxDocumentCleanupWorker.name);
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(TAX_DOCUMENT_CLEANUP_REPOSITORY)
    private readonly uploads: ITaxDocumentCleanupRepository,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly tenantDb: TenantDbService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (
      process.env.TAX_DOCUMENT_CLEANUP_DISABLED === 'true' ||
      process.env.OUTBOX_RELAY_DISABLED === 'true'
    ) {
      return;
    }
    const connection = { url: process.env.REDIS_URL ?? 'redis://localhost:6379' };
    this.queue = new Queue(TAX_DOCUMENT_CLEANUP_QUEUE, { connection, ...QUEUE_OPTIONS });
    await this.queue.upsertJobScheduler(
      'tax-document-cleanup-poll',
      { every: POLL_EVERY_MS },
      { name: 'poll' },
    );
    this.worker = new Worker(TAX_DOCUMENT_CLEANUP_QUEUE, () => this.sweep(), { connection });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  async sweep(): Promise<number> {
    const now = new Date();
    const candidates = await this.uploads.findCandidates(100, now);
    let deleted = 0;
    for (const candidate of candidates) {
      try {
        const removed = await this.tenantDb.forTenant(candidate.tenantId, async (tx) => {
          const key = await this.uploads.claim(tx, candidate.tenantId, candidate.id, now);
          if (!key) return false;
          await this.storage.deletePrivateObject(key);
          await this.uploads.markDeleted(tx, candidate.tenantId, candidate.id, new Date());
          return true;
        });
        if (removed) deleted++;
      } catch (error) {
        this.logger.warn(
          `tax upload ${candidate.id} cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return deleted;
  }
}
