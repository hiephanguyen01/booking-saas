import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue, Worker, type Job } from 'bullmq';
import { domainVerificationRecord } from '../domain/hostname';
import type { IDomainVerificationQueue } from '../domain/ports/domain-verification-queue.port';
import {
  TENANT_DOMAIN_REPOSITORY,
  type ITenantDomainRepository,
} from '../domain/ports/tenant-domain-repository.port';
import { DNS_VERIFIER, type IDnsVerifier } from '../domain/ports/dns-verifier.port';
import { TENANT_CACHE, type ITenantCache } from '../domain/ports/tenant-cache.port';

export const DOMAIN_VERIFICATION_QUEUE_NAME = 'domain-verification';
/** Retries let a not-yet-propagated TXT record catch up before giving up. */
const MAX_ATTEMPTS = 5;
const BACKOFF_MS = 5_000;

interface VerifyJob {
  tenantId: string;
  domainId: string;
}

/**
 * Background custom-domain verification (§6.1). The endpoint enqueues a job and
 * returns "checking"; this worker resolves the TXT record (admin pool — no tenant
 * context needed for domain lookups) and sets `verified_at` on success. A missing
 * record throws so BullMQ retries with exponential backoff until it propagates.
 * Follows the outbox-relay / booking-scheduler worker lifecycle conventions.
 */
@Injectable()
export class DomainVerificationWorker
  implements IDomainVerificationQueue, OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(DomainVerificationWorker.name);
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(TENANT_DOMAIN_REPOSITORY) private readonly domains: ITenantDomainRepository,
    @Inject(DNS_VERIFIER) private readonly dns: IDnsVerifier,
    @Inject(TENANT_CACHE) private readonly cache: ITenantCache,
  ) {}

  onModuleInit(): void {
    const connection = { url: process.env.REDIS_URL ?? 'redis://localhost:6379' };
    // The producer (queue) is always available so the API can enqueue; the
    // consumer (worker) is skipped when relays are disabled (e.g. in tests).
    this.queue = new Queue(DOMAIN_VERIFICATION_QUEUE_NAME, { connection });
    if (process.env.OUTBOX_RELAY_DISABLED === 'true') return;
    this.worker = new Worker<VerifyJob>(
      DOMAIN_VERIFICATION_QUEUE_NAME,
      (job: Job<VerifyJob>) => this.process(job.data),
      { connection },
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  async enqueue(tenantId: string, domainId: string): Promise<void> {
    if (!this.queue) return;
    await this.queue.add(
      'verify',
      { tenantId, domainId } satisfies VerifyJob,
      {
        attempts: MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: BACKOFF_MS },
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
  }

  /** Resolve the TXT record and mark verified; throw to retry when absent. */
  async process(data: VerifyJob): Promise<void> {
    const domain = await this.domains.findById(data.domainId);
    if (!domain || domain.tenantId !== data.tenantId) return; // deleted/reassigned
    if (domain.verifiedAt) return; // already verified by a prior attempt
    if (!domain.verificationToken) return; // nothing to check against

    const record = domainVerificationRecord(domain.hostname, domain.verificationToken);
    const ok = await this.dns.hasTxtRecord(record.name, record.value);
    if (!ok) {
      // Throwing reschedules the job with backoff — the record may still propagate.
      throw new Error(`TXT record ${record.name} not found yet for ${domain.hostname}`);
    }

    await this.domains.markVerified(domain.id);
    await this.cache.invalidateHost(domain.hostname);
    this.logger.log(`domain ${domain.hostname} verified`);
  }
}
