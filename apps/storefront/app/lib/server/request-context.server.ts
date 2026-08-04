import { AsyncLocalStorage } from 'node:async_hooks';
import type { SessionInfoResponse } from '@booking/contracts';
import type { StorefrontSessionData } from './session.server';
import type { StorefrontTenant } from './tenant.server';

export interface StorefrontAuthContext {
  /** Redis session id (the value the signed cookie carries), not the backend token. */
  sessionId: string;
  session: StorefrontSessionData;
  info: SessionInfoResponse;
}

export interface StorefrontTenantRequestContextState {
  kind: 'tenant';
  tenant: StorefrontTenant;
  auth: StorefrontAuthContext | null;
  suppressSessionCommit: boolean;
}

export interface StorefrontPlatformRequestContextState {
  kind: 'platform';
  auth: null;
  suppressSessionCommit: false;
}

export type StorefrontRequestContextState =
  StorefrontTenantRequestContextState | StorefrontPlatformRequestContextState;

const storage = new AsyncLocalStorage<StorefrontRequestContextState>();
export const runWithStorefrontRequestContext = <T>(
  state: StorefrontRequestContextState,
  callback: () => T,
) => storage.run(state, callback);
export const getCurrentStorefrontTenant = (): StorefrontTenant => {
  const state = storage.getStore();
  if (!state || state.kind !== 'tenant') {
    throw new Error('Storefront tenant accessed outside a tenant request context');
  }
  return state.tenant;
};
export const getOptionalStorefrontTenant = (): StorefrontTenant | null => {
  const state = storage.getStore();
  return state?.kind === 'tenant' ? state.tenant : null;
};
export const getCurrentStorefrontAuth = () => storage.getStore()?.auth ?? null;
export const suppressStorefrontSessionCommit = () => {
  const state = storage.getStore();
  if (state?.kind === 'tenant') state.suppressSessionCommit = true;
};
