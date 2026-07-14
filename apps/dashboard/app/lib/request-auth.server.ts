import { AsyncLocalStorage } from 'node:async_hooks';
import type { SessionInfoResponse } from '@booking/contracts';
import type { DashboardSessionData } from './session.server';

export interface DashboardAuthContext {
  user: DashboardSessionData;
  info: SessionInfoResponse;
}

export interface DashboardRequestAuthState {
  auth: DashboardAuthContext | null;
  suppressSessionCommit: boolean;
}

const requestAuthStorage = new AsyncLocalStorage<DashboardRequestAuthState>();

export function runWithDashboardRequestAuth<T>(
  state: DashboardRequestAuthState,
  callback: () => T,
): T {
  return requestAuthStorage.run(state, callback);
}

export function getCurrentDashboardAuth(): DashboardAuthContext | null {
  return requestAuthStorage.getStore()?.auth ?? null;
}

export function suppressAuthSessionCommit(): void {
  const state = requestAuthStorage.getStore();
  if (!state) {
    throw new Error('No Dashboard request auth scope is active.');
  }
  state.suppressSessionCommit = true;
}
