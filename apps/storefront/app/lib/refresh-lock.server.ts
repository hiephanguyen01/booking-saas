import { randomUUID } from 'node:crypto';

const REFRESH_LOCK_PREFIX = 'bookify:storefront:session-refresh-lock:';
const DEFAULT_REFRESH_LOCK_TTL_MS = 35_000;
const DEFAULT_REFRESH_LOCK_RETRY_MS = 250;

export interface RefreshLockStore {
  setIfAbsent(key: string, value: string, ttlMs: number): Promise<boolean>;
  deleteIfValue(key: string, value: string): Promise<void>;
}

export type RefreshLockObservation<T> =
  | { resolved: false }
  | { resolved: true; value: T };

export interface RefreshLockOptions {
  ttlMs?: number;
  retryMs?: number;
  waitMs?: number;
  now?: () => number;
  delay?: (milliseconds: number) => Promise<void>;
  valueFactory?: () => string;
}

export class SessionRefreshLockTimeoutError extends Error {
  constructor() {
    super('Timed out waiting for the storefront session refresh lock');
    this.name = 'SessionRefreshLockTimeoutError';
  }
}

const defaultDelay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function withDistributedRefreshLock<T>(
  store: RefreshLockStore,
  id: string,
  callback: () => Promise<T>,
  observeWhileWaiting?: () => Promise<RefreshLockObservation<T>>,
  options: RefreshLockOptions = {},
): Promise<T> {
  const ttlMs = options.ttlMs ?? DEFAULT_REFRESH_LOCK_TTL_MS;
  const retryMs = options.retryMs ?? DEFAULT_REFRESH_LOCK_RETRY_MS;
  const waitMs = options.waitMs ?? ttlMs + retryMs;
  const now = options.now ?? Date.now;
  const delay = options.delay ?? defaultDelay;
  const key = `${REFRESH_LOCK_PREFIX}${id}`;
  const value = (options.valueFactory ?? randomUUID)();
  const deadline = now() + waitMs;
  let acquired = await store.setIfAbsent(key, value, ttlMs);

  while (!acquired) {
    const observation = await observeWhileWaiting?.();
    if (observation?.resolved) return observation.value;

    const remainingWaitMs = deadline - now();
    if (remainingWaitMs <= 0) break;
    await delay(Math.min(retryMs, remainingWaitMs));
    acquired = await store.setIfAbsent(key, value, ttlMs);
  }

  if (!acquired && observeWhileWaiting) {
    const finalObservation = await observeWhileWaiting();
    if (finalObservation.resolved) return finalObservation.value;
  }
  if (!acquired) throw new SessionRefreshLockTimeoutError();

  try {
    return await callback();
  } finally {
    await store.deleteIfValue(key, value).catch((error: unknown) => {
      console.error('Failed to release storefront session refresh lock', error);
    });
  }
}
