export type GatewayFailureKind = 'retryable' | 'configuration' | 'final';

export class GatewayRequestError extends Error {
  readonly status?: number;

  constructor(
    public readonly kind: GatewayFailureKind,
    message: string,
    options?: { cause?: unknown; status?: number },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'GatewayRequestError';
    this.status = options?.status;
  }
}

function defaultHttpFailureKind(status: number): GatewayFailureKind {
  if (status === 401 || status === 403) return 'configuration';
  if (status === 408 || status === 425 || status === 429 || status >= 500) return 'retryable';
  return 'final';
}

/**
 * Small provider-boundary helper. It deliberately never includes request/response
 * bodies or headers in thrown messages, so gateway credentials and signed payloads
 * cannot leak through application error handling or logs.
 */
export async function providerJson<T>(input: {
  url: string;
  init: RequestInit;
  timeoutMs: number;
  parse: (value: unknown) => T;
  classifyHttpStatus?: (status: number) => GatewayFailureKind;
}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input.url, {
      ...input.init,
      signal: AbortSignal.timeout(input.timeoutMs),
    });
  } catch (cause) {
    throw new GatewayRequestError('retryable', 'Payment provider request failed', { cause });
  }

  if (!response.ok) {
    const classify = input.classifyHttpStatus ?? defaultHttpFailureKind;
    throw new GatewayRequestError(classify(response.status), 'Payment provider request failed', {
      status: response.status,
    });
  }

  let value: unknown;
  try {
    value = await response.json();
  } catch (cause) {
    throw new GatewayRequestError('retryable', 'Payment provider returned an invalid response', {
      cause,
      status: response.status,
    });
  }

  try {
    return input.parse(value);
  } catch (cause) {
    if (cause instanceof GatewayRequestError) throw cause;
    throw new GatewayRequestError('retryable', 'Payment provider returned an invalid response', {
      cause,
      status: response.status,
    });
  }
}
