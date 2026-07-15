import { AsyncLocalStorage } from 'node:async_hooks';
import type { SessionInfoResponse } from '@booking/contracts';
import type { StorefrontSessionData } from './session.server';

export interface StorefrontAuthContext {
  session: StorefrontSessionData;
  info: SessionInfoResponse;
}

export interface StorefrontRequestAuthState {
  auth: StorefrontAuthContext | null;
  suppressSessionCommit: boolean;
}

const storage = new AsyncLocalStorage<StorefrontRequestAuthState>();
export const runWithStorefrontRequestAuth = <T>(
  state: StorefrontRequestAuthState,
  callback: () => T,
) => storage.run(state, callback);
export const getCurrentStorefrontAuth = () => storage.getStore()?.auth ?? null;
export const suppressStorefrontSessionCommit = () => {
  const state = storage.getStore();
  if (state) state.suppressSessionCommit = true;
};
