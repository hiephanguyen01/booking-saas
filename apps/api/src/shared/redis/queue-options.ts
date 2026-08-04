import type { QueueOptions } from 'bullmq';

/**
 * Retention for every BullMQ queue in this API.
 *
 * BullMQ keeps completed and failed jobs forever unless told otherwise, and
 * five of our queues are *pollers* — the outbox relay alone adds a job every
 * two seconds, ~43k a day. Left at the default that is tens of thousands of job
 * hashes a day accumulating in a Redis that is deliberately `noeviction`
 * (see `docker-compose.stg-data.yml`), so the instance eventually refuses every
 * write with `OOM command not allowed` and all the workers stop at once.
 *
 * Bounding it by both age and count means a burst cannot outrun the cap and an
 * idle queue does not hold yesterday's ticks. Failures are kept far longer than
 * successes because they are the ones anybody ever reads.
 *
 * `Queue.upsertJobScheduler` merges these under the scheduler's own template
 * opts (`{ ...this.jobsOpts, ...template.opts }`), so repeated poll jobs
 * inherit them without each scheduler having to restate them.
 */
export const QUEUE_JOB_RETENTION = {
  removeOnComplete: { age: 3_600, count: 100 },
  removeOnFail: { age: 7 * 24 * 3_600, count: 500 },
} as const;

/**
 * Base options for `new Queue(...)`. Also caps the per-queue events stream,
 * which nothing in this codebase consumes — the 10 000-entry default is pure
 * memory for us.
 */
export const QUEUE_OPTIONS: Omit<QueueOptions, 'connection'> = {
  defaultJobOptions: QUEUE_JOB_RETENTION,
  streams: { events: { maxLen: 1_000 } },
};
