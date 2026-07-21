import { AsyncLocalStorage } from 'node:async_hooks';
import type { SessionInfoResponse } from '@booking/contracts';
import type { StorefrontSessionData } from './session.server';
import type { StorefrontTenant } from './tenant.server';
import { registerStorefrontTimezoneResolver } from './timezone-runtime';

export interface StorefrontAuthContext {
  session: StorefrontSessionData;
  info: SessionInfoResponse;
}

export interface StorefrontRequestMetadata {
  id: string;
  method: string;
  path: string;
  startedAtMs: number;
}

export interface StorefrontRequestContextState {
  tenant: StorefrontTenant;
  auth: StorefrontAuthContext | null;
  request: StorefrontRequestMetadata;
  suppressSessionCommit: boolean;
}

const storage = new AsyncLocalStorage<StorefrontRequestContextState>();

registerStorefrontTimezoneResolver(() => storage.getStore()?.tenant.defaultTimezone);

export const runWithStorefrontRequestContext = <T>(
  state: StorefrontRequestContextState,
  callback: () => T,
) => storage.run(state, callback);
export const getCurrentStorefrontRequestContext = () => storage.getStore() ?? null;
export const getCurrentStorefrontTenant = (): StorefrontTenant => {
  const state = storage.getStore();
  if (!state) {
    throw new Error('Storefront tenant accessed outside the request context');
  }
  return state.tenant;
};
export const getCurrentStorefrontAuth = () => storage.getStore()?.auth ?? null;
export const suppressStorefrontSessionCommit = () => {
  const state = storage.getStore();
  if (state) state.suppressSessionCommit = true;
};
