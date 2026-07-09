export const DOMAIN_VERIFICATION_QUEUE = Symbol('DOMAIN_VERIFICATION_QUEUE');

/**
 * Enqueues an asynchronous custom-domain DNS check (§6.1). The HTTP request only
 * schedules the work; a background worker resolves the TXT record with
 * retry/backoff so a slow or not-yet-propagated resolver never blocks the API.
 */
export interface IDomainVerificationQueue {
  enqueue(tenantId: string, domainId: string): Promise<void>;
}
