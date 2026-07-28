/**
 * Optional page sections may degrade on ordinary upstream 4xx/data errors, but
 * request cancellation and infrastructure failures must preserve their control
 * flow so React Router can stop work or render the correct 5xx boundary.
 */
export function rethrowCriticalDataError(error: unknown): void {
  if (error instanceof Response && error.status >= 500) throw error;
  if (isAbortLikeError(error)) throw error;
}

export async function optionalData<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    rethrowCriticalDataError(error);
    return fallback;
  }
}

export function isAbortLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'AbortError' || error.name === 'CanceledError') return true;
  const code = (error as Error & { code?: unknown }).code;
  return code === 'ERR_CANCELED';
}
