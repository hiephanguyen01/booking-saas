export type GatewayFailureKind = 'retryable' | 'configuration' | 'final';

/**
 * Provider-neutral failure classification exposed by the payment gateway port boundary.
 * Application code may branch on retryability without importing infrastructure helpers
 * or provider-specific error payloads.
 */
export class GatewayOperationError extends Error {
  readonly status?: number;

  constructor(
    public readonly kind: GatewayFailureKind,
    message: string,
    options?: { cause?: unknown; status?: number },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'GatewayOperationError';
    this.status = options?.status;
  }
}
