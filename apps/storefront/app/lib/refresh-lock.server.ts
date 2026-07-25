import { randomUUID } from 'node:crypto';

const REFRESH_LOCK_PREFIX = 'bookify:storefront:session-refresh-lock:';
const DEFAULT_REFRESH_LOCK_TTL_MS = 35_000;
const DEFAULT_REFRESH_LOCK_RETRY_MS = 250;

export interface RefreshLockStore {
  setIfAbsent(key: string, value: string, ttlMs: number): Promise<boolean>;
  extendIfValue(key: string, value: string, ttlMs: number): Promise<boolean>;
  deleteIfValue(key: string, value: string): Promise<void>;
}

export type RefreshLockObservation<T> =
  | { resolved: false }
  | { resolved: true; value: T };

export interface RefreshLockOptions {
  ttlMs?: number;
  retryMs?: number;
  waitMs?: number;
  renewMs?: number;
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

export class SessionRefreshLockLostError extends Error {
  constructor() {
    super('Lost ownership of the storefront session refresh lock');
    this.name = 'SessionRefreshLockLostError';
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
  const requestedRenewMs = options.renewMs ?? Math.floor(ttlMs / 3);
  const renewMs = Math.max(1, Math.min(requestedRenewMs, Math.max(1, ttlMs - 1)));
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

  let stopped = false;
  let leaseLost = false;
  let renewalTimer: ReturnType<typeof setTimeout> | undefined;
  let renewalInFlight: Promise<void> | undefined;

  const scheduleRenewal = () => {
    if (stopped || leaseLost) return;
    renewalTimer = setTimeout(() => {
      renewalTimer = undefined;
      renewalInFlight = store
        .extendIfValue(key, value, ttlMs)
        .then((extended) => {
          if (!extended) {
            leaseLost = true;
            return;
          }
          scheduleRenewal();
        })
        .catch((error: unknown) => {
          leaseLost = true;
          console.error('Failed to renew storefront session refresh lock', error);
        });
    }, renewMs);
  };

  scheduleRenewal();
  let callbackCompleted = false;
  try {
    const result = await callback();
    callbackCompleted = true;
    return result;
  } finally {
    stopped = true;
    if (renewalTimer !== undefined) clearTimeout(renewalTimer);
    await renewalInFlight?.catch(() => undefined);
    await store.deleteIfValue(key, value).catch((error: unknown) => {
      console.error('Failed to release storefront session refresh lock', error);
    });
    if (callbackCompleted && leaseLost) throw new SessionRefreshLockLostError();
  }
}
